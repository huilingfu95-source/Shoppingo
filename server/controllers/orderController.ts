import { Response } from "express";
import { randomBytes } from "crypto";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

// find the authenticated merchant's store (store_id never comes from the body)
const getStore = (merchantId: string) =>
    prisma.stores.findFirst({ where: { merchant_id: merchantId }, select: { id: true } });

// parse an ID from params or body: positive safe integer (number or digit string), otherwise null
const parseId = (value: unknown): number | null => {
    const id = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};

// trimmed non-empty string within maxLength, otherwise null
const requiredString = (value: unknown, maxLength = 255): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= maxLength ? trimmed : null;
};

// optional string: missing / null / blank → null; a valid trimmed string → the string;
// anything else (wrong type, too long) → undefined so the caller can return 400 instead of silently dropping it
const optionalString = (value: unknown, maxLength = 255): string | null | undefined => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length <= maxLength ? trimmed : undefined;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

type ShippingAddress = {
    line1: string;
    line2: string | null;
    city: string;
    state: string | null;
    postal_code: string;
    country: string;
};

// keep only known address fields; required: line1, city, postal_code, country
const parseShippingAddress = (value: unknown): ShippingAddress | null => {
    if (!isPlainObject(value)) return null;
    const line1 = requiredString(value.line1);
    const city = requiredString(value.city, 100);
    const postal_code = requiredString(value.postal_code, 20);
    const country = requiredString(value.country, 100);
    const line2 = optionalString(value.line2);
    const state = optionalString(value.state, 100);
    if (!line1 || !city || !postal_code || !country || line2 === undefined || state === undefined) return null;
    return { line1, line2, city, state, postal_code, country };
};

// JSON with object keys sorted, so {a,b} and {b,a} compare equal
const sortKeys = (value: unknown): unknown =>
    Array.isArray(value)
        ? value.map(sortKeys)
        : isPlainObject(value)
          ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]))
          : value;
const canonical = (value: unknown): string => JSON.stringify(sortKeys(value)) ?? "null";

// find the product variant the customer picked: every key they sent must equal that key in exactly one entry
// returns the server's own entry (never the client's object) so the snapshot can't be forged
const matchVariant = (
    productVariants: unknown,
    requested: Record<string, unknown> | null,
): { variant: Record<string, unknown> | null } | { error: string } => {
    const options = Array.isArray(productVariants) ? productVariants.filter(isPlainObject) : [];
    if (options.length === 0) return requested === null ? { variant: null } : { error: "has no variants" };
    if (requested === null) return { error: "requires a variant" };
    const matches = options.filter((option) =>
        Object.entries(requested).every(([key, value]) => canonical(option[key]) === canonical(value)),
    );
    if (matches.length === 0) return { error: "does not offer that variant" };
    if (matches.length > 1) return { error: "variant is ambiguous, specify more options" };
    return { variant: matches[0] };
};

// a variant may override the product price with its own non-negative "price"
const variantPrice = (variant: Record<string, unknown> | null, fallback: unknown): unknown => {
    const price = variant?.price;
    if (price === undefined || price === null || price === "") return fallback;
    const n = Number(price);
    return Number.isFinite(n) && n >= 0 ? price : fallback;
};

const isUniqueViolation = (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// money math in integer cents to avoid floating point drift
const toCents = (value: unknown): number => Math.round(Number(value ?? 0) * 100);
const fromCents = (cents: number): string => (cents / 100).toFixed(2);

// unguessable order number: the receipt endpoint uses it as a lookup key for guests
const generateOrderNumber = (): string =>
    `ORD-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;

// pagination from query: page >= 1, 1 <= limit <= 100
const parsePagination = (query: AuthenticatedRequest["query"]) => {
    const page = parseId(query.page) ?? 1;
    const limit = Math.min(parseId(query.limit) ?? 20, 100);
    return { page, limit, skip: (page - 1) * limit };
};

const ORDER_STATUSES = ["placed", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const;
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
const PAYMENT_METHODS = ["cod", "card"] as const;
// allowed next statuses; delivered / cancelled / refunded are final
const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
    placed: ["confirmed", "processing", "cancelled"],
    confirmed: ["processing", "shipped", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
};
const PAYMENT_TRANSITIONS: Record<string, readonly string[]> = {
    pending: ["paid", "failed"],
    failed: ["pending", "paid"],
    paid: ["refunded"],
    refunded: [],
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 100;
const MAX_VARIANT_JSON_LENGTH = 500;
const ORDER_NUMBER_ATTEMPTS = 3;

type OrderItemSnapshot = {
    product_id: number;
    name: string;
    sku: string | null;
    image: unknown;
    variant: unknown;
    price: string;
    quantity: number;
    line_total: string;
};

// thrown inside the transaction to roll back and return a 4xx
class OrderError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// POST: create an order (guest checkout allowed; customer_id is set when logged in)
// prices, shipping and totals are computed on the server — never trusted from the body
export const createOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { storeSlug, store_id, items, customer_name, customer_email, customer_phone, shipping_address, payment_method = "cod", coupon_code } = req.body;

        // validate the whole body before touching the database
        const storeId = parseId(store_id);
        const slug = requiredString(storeSlug);
        if (!slug && !storeId) {
            res.status(400).json({ success: false, message: "storeSlug or store_id is required" });
            return;
        }
        const storeWhere: Prisma.storesWhereUniqueInput = slug ? { slug } : { id: storeId! };

        const name = requiredString(customer_name);
        const email = requiredString(customer_email)?.toLowerCase() ?? null;
        if (!name || !email || !EMAIL_RE.test(email)) {
            res.status(400).json({ success: false, message: "customer_name and a valid customer_email are required" });
            return;
        }
        const phone = optionalString(customer_phone, 50);
        if (phone === undefined) {
            res.status(400).json({ success: false, message: "customer_phone must be a string (max 50 chars)" });
            return;
        }
        const coupon = optionalString(coupon_code, 50);
        if (coupon === undefined) {
            res.status(400).json({ success: false, message: "coupon_code must be a string (max 50 chars)" });
            return;
        }
        const address = parseShippingAddress(shipping_address);
        if (!address) {
            res.status(400).json({
                success: false,
                message: "shipping_address needs line1, city, postal_code and country (line2 and state optional)",
            });
            return;
        }
        if (!PAYMENT_METHODS.includes(payment_method)) {
            res.status(400).json({ success: false, message: `payment_method must be one of: ${PAYMENT_METHODS.join(", ")}` });
            return;
        }
        if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
            res.status(400).json({ success: false, message: `items must be a non-empty array (max ${MAX_ITEMS})` });
            return;
        }

        // validate items and merge duplicates of the same product + variant (key order doesn't matter)
        type RequestedItem = { productId: number; quantity: number; variant: Record<string, unknown> | null };
        const requested = new Map<string, RequestedItem>();
        for (const item of items) {
            const productId = parseId(item?.product_id);
            const quantity = parseId(item?.quantity);
            if (productId === null || quantity === null || quantity > MAX_QUANTITY) {
                res.status(400).json({ success: false, message: `Each item needs a product_id and a quantity between 1 and ${MAX_QUANTITY}` });
                return;
            }
            const rawVariant = item.variant ?? null;
            if (rawVariant !== null && (!isPlainObject(rawVariant) || canonical(rawVariant).length > MAX_VARIANT_JSON_LENGTH)) {
                res.status(400).json({ success: false, message: `variant must be an object (max ${MAX_VARIANT_JSON_LENGTH} chars as JSON)` });
                return;
            }
            const variant = rawVariant && Object.keys(rawVariant).length > 0 ? rawVariant : null;
            const key = `${productId}:${canonical(variant)}`;
            const existing = requested.get(key);
            const merged = (existing?.quantity ?? 0) + quantity;
            if (merged > MAX_QUANTITY) {
                res.status(400).json({ success: false, message: `Quantity per product/variant cannot exceed ${MAX_QUANTITY}` });
                return;
            }
            requested.set(key, { productId, variant, quantity: merged });
        }

        const placeOrder = async (tx: Prisma.TransactionClient) => {
            const store = await tx.stores.findUnique({
                where: storeWhere,
                select: { id: true, status: true, shipping_fee: true, free_shipping_threshold: true },
            });
            if (!store) throw new OrderError(404, "Store not found");
            if (store.status === "suspended") throw new OrderError(403, "This store is suspended");
            if (store.status !== "active") throw new OrderError(404, "Store not found or inactive");

            const productIds = [...new Set([...requested.values()].map((r) => r.productId))];
            const products = await tx.products.findMany({
                where: { id: { in: productIds }, store_id: store.id, status: "active" },
            });
            const productMap = new Map(products.map((p) => [p.id, p]));

            const snapshot: OrderItemSnapshot[] = [];
            let subtotalCents = 0;
            for (const { productId, quantity, variant } of requested.values()) {
                const product = productMap.get(productId);
                if (!product) throw new OrderError(400, `Product ${productId} is not available in this store`);

                const matched = matchVariant(product.variants, variant);
                if ("error" in matched) throw new OrderError(400, `"${product.name}" ${matched.error}`);

                // atomic stock check + decrement: fails if another order took the stock first
                const { count } = await tx.products.updateMany({
                    where: { id: productId, stock: { gte: quantity } },
                    data: { stock: { decrement: quantity } },
                });
                if (count === 0) throw new OrderError(409, `Not enough stock for "${product.name}"`);

                const priceCents = toCents(variantPrice(matched.variant, product.price));
                const lineCents = priceCents * quantity;
                subtotalCents += lineCents;
                snapshot.push({
                    product_id: product.id,
                    name: product.name,
                    sku: product.sku,
                    image: Array.isArray(product.images) ? (product.images[0] ?? null) : null,
                    variant: matched.variant,
                    price: fromCents(priceCents),
                    quantity,
                    line_total: fromCents(lineCents),
                });
            }

            // free shipping when threshold > 0 and subtotal reaches it
            const thresholdCents = toCents(store.free_shipping_threshold);
            const shippingCents = thresholdCents > 0 && subtotalCents >= thresholdCents ? 0 : toCents(store.shipping_fee);
            // no coupons table yet: coupon_code is recorded but discount stays 0
            const discountCents = 0;

            return tx.orders.create({
                data: {
                    order_number: generateOrderNumber(),
                    store_id: store.id,
                    customer_id: req.user?.id ?? null,
                    customer_name: name,
                    customer_email: email,
                    customer_phone: phone,
                    shipping_address: address,
                    items: snapshot as unknown as Prisma.InputJsonArray,
                    subtotal: fromCents(subtotalCents),
                    discount: fromCents(discountCents),
                    shipping_cost: fromCents(shippingCents),
                    total: fromCents(subtotalCents - discountCents + shippingCents),
                    coupon_code: coupon,
                    payment_method,
                    payment_status: "pending",
                    order_status: "placed"
                },
            });
        };

        // retry on the (very unlikely) order_number collision; the rolled-back transaction redoes the stock checks
        let order;
        for (let attempt = 1; ; attempt++) {
            try {
                order = await prisma.$transaction(placeOrder);
                break;
            } catch (error) {
                if (attempt < ORDER_NUMBER_ATTEMPTS && isUniqueViolation(error)) continue;
                throw error;
            }
        }

        res.status(201).json({ success: true, message: "Order placed successfully", order });
    } catch (error: any) {
        if (error instanceof OrderError) {
            res.status(error.status).json({ success: false, message: error.message });
            return;
        }
        console.error("createOrder error:", error);
        res.status(500).json({ success: false, message: "Failed to create order" });
    }
};

// GET: orders of the authenticated merchant's store (?status=&page=&limit=)
export const getMerchantOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const store = await getStore(req.user!.id);
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }
        //1. Get status from URL
        const status = typeof req.query.status === "string" ? req.query.status : undefined;
        //2. Validate order status
        //If a status was sent, and it’s not one of the allowed statuses, then do something
        if (status && !ORDER_STATUSES.includes(status as any)) {
            res.status(400).json({ success: false, message: `status must be one of: ${ORDER_STATUSES.join(", ")}` });
            return;
        }

        const { page, limit, skip } = parsePagination(req.query);
        const where = { store_id: store.id, ...(status ? { order_status: status } : {}) };
        const [orders, total] = await Promise.all([
            prisma.orders.findMany({ where, orderBy: { created_at: "desc" }, skip, take: limit }),
            prisma.orders.count({ where }),
        ]);

        res.json({ success: true, orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
        console.error("getMerchantOrders error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
};

// PATCH: partially merchant updates order_status / payment_status / tracking_number of an order in their store
// cancelling restores product stock
export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const store = await getStore(req.user!.id);
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }
        //order id
        const id = parseId(req.params.id);
        if (id === null) {
            res.status(400).json({ success: false, message: "Order id must be a positive integer" });
            return;
        }

        const { order_status, payment_status, tracking_number } = req.body;
        if (order_status === undefined && payment_status === undefined && tracking_number === undefined) {
            res.status(400).json({ success: false, message: "Provide order_status, payment_status or tracking_number" });
            return;
        }
        if (order_status !== undefined && !ORDER_STATUSES.includes(order_status)) {
            res.status(400).json({ success: false, message: `order_status must be one of: ${ORDER_STATUSES.join(", ")}` });
            return;
        }
        if (payment_status !== undefined && !PAYMENT_STATUSES.includes(payment_status)) {
            res.status(400).json({ success: false, message: `payment_status must be one of: ${PAYMENT_STATUSES.join(", ")}` });
            return;
        }
        if (tracking_number !== undefined && tracking_number !== null && (typeof tracking_number !== "string" || tracking_number.length > 100)) {
            res.status(400).json({ success: false, message: "tracking_number must be a string (max 100 chars)" });
            return;
        }



        const updated = await prisma.$transaction(async (tx) => {
            // store_id in where: a merchant can only update orders of their own store
            const existing = await tx.orders.findFirst({ where: { id, store_id: store.id } });
            if (!existing) throw new OrderError(404, "Order not found or access denied");

            // null in the DB means the column default
            const currentStatus = existing.order_status ?? "placed";
            const currentPayment = existing.payment_status ?? "pending";

            const statusChanging = order_status !== undefined && order_status !== currentStatus;
            if (statusChanging && !ORDER_TRANSITIONS[currentStatus]?.includes(order_status)) {
                throw new OrderError(409, `Order status cannot change from ${currentStatus} to ${order_status}`);
            }
            const paymentChanging = payment_status !== undefined && payment_status !== currentPayment;
            if (paymentChanging && !PAYMENT_TRANSITIONS[currentPayment]?.includes(payment_status)) {
                throw new OrderError(409, `Payment status cannot change from ${currentPayment} to ${payment_status}`);
            }

            // guarded update: if a concurrent request changed either status first, count is 0
            const { count } = await tx.orders.updateMany({
                where: { id, order_status: existing.order_status, payment_status: existing.payment_status },
                data: Object.fromEntries(
                    Object.entries({
                        order_status,
                        payment_status,
                        tracking_number: tracking_number === undefined ? undefined : tracking_number?.trim() || null,
                    }).filter(([, v]) => v !== undefined),
                ),
            });
            if (count === 0) throw new OrderError(409, "Order was modified by another request, please retry");

            // cancelled → put the stock back (product may have been deleted: updateMany just matches 0)
            if (statusChanging && order_status === "cancelled" && Array.isArray(existing.items)) {
                for (const item of existing.items as OrderItemSnapshot[]) {
                    await tx.products.updateMany({
                        where: { id: item.product_id, store_id: store.id },
                        data: { stock: { increment: item.quantity } },
                    });
                }
            }

            return tx.orders.findUnique({ where: { id } });
        });

        res.json({ success: true, message: "Order updated successfully", order: updated });
    } catch (error: any) {
        if (error instanceof OrderError) {
            res.status(error.status).json({ success: false, message: error.message });
            return;
        }
        console.error("updateOrderStatus error:", error);
        res.status(500).json({ success: false, message: "Failed to update order" });
    }
};

// GET: receipt by order_number
// allowed: admin, merchant of the order's store, the logged-in customer who placed it,
// or a guest who supplies the matching ?email=
export const getOrderReceipt = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const orderNumber = requiredString(req.params.orderNumber, 100);
        if (!orderNumber) {
            res.status(400).json({ success: false, message: "Order number is required" });
            return;
        }

        const order = await prisma.orders.findUnique({
            where: { order_number: orderNumber },
            include: {
                stores: {
                    select: { id: true, name: true, slug: true, logo_url: true, currency: true, accent_color: true },
                },
            },
        });

        const user = req.user;
        const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
        const allowed =
            !!order &&
            (user?.role === "admin" ||
                (!!user && order.customer_id === user.id) ||
                (!!user?.storeId && order.store_id === Number(user.storeId)) ||
                (!!email && order.customer_email.toLowerCase() === email));

        // same 404 for "not found" and "not yours" so order numbers can't be probed
        if (!order || !allowed) {
            res.status(404).json({ success: false, message: "Order not found" });
            return;
        }

        const { stores: store, ...rest } = order;
        res.json({
            success: true,
            receipt: {
                ...rest,
                store,
                store_currency: store?.currency ?? null,
                store_logo: store?.logo_url ?? null,
                store_accent_color: store?.accent_color ?? null,
            },
        });
    } catch (error: any) {
        console.error("getOrderReceipt error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch receipt" });
    }
};


// GET: orders placed by the logged-in user (?page=&limit=)
export const getCustomerOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const where = { customer_id: req.user!.id };
        const [orders, total] = await Promise.all([
            prisma.orders.findMany({
                where,
                orderBy: { created_at: "desc" },
                skip,
                take: limit,
                include: { stores: { select: { name: true, slug: true, logo_url: true } } },
            }),
            prisma.orders.count({ where }),
        ]);

        res.json({ success: true, orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
        console.error("getCustomerOrders error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
};


// ORDER CONTROLLER
// │
// ├── POST: createOrder()  (rate limited per IP, optionalAuth — guest checkout allowed)
// │   ├── validate storeSlug|store_id / customer / phone / coupon / shipping_address / items → 400
// │   ├── $transaction (retried on order_number collision):
// │   │   ├── store missing → 404; suspended → 403; not active → 404
// │   │   ├── products must be active + in that store → 400
// │   │   ├── variant must match exactly one entry of product.variants (or none if it has none) → 400
// │   │   ├── stock decremented atomically (updateMany stock >= qty) → 409 if short
// │   │   ├── prices (variant price overrides product price) + shipping from DB
// │   │   └── orders.create with items snapshot + random order_number
// │   └── Return 201 + order
// │
// ├── GET: getMerchantOrders()  (merchant) → own store's orders, ?status, paginated
// │
// ├── PATCH: updateOrderStatus()  (merchant)
// │   ├── validate order_status / payment_status / tracking_number → 400
// │   ├── order not in merchant's store → 404
// │   ├── only allowed transitions (ORDER_TRANSITIONS / PAYMENT_TRANSITIONS) → else 409
// │   ├── concurrent change of either status → 409
// │   └── cancelled → restore stock in same transaction
// │
// ├── GET: getOrderReceipt()  (optionalAuth)
// │   └── admin / store merchant / owning customer / guest with ?email= → else 404
// │
// └── GET: getCustomerOrders()  (requireAuth) → orders where customer_id = req.user.id
