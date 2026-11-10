import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { updateNeonUserRole } from "../services/neonUser.js";

// generate slug: "My Cool Shop" -> "my-cool-shop"
const generateSlug = (text: string): string =>
    text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""); 

// optional string field from body: undefined if missing/empty, null if wrong type
const optionalString = (value: unknown, maxLength = 2000): string | undefined | null => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.length <= maxLength ? trimmed : null;
};

// slugs that collide with fixed GET routes in storeRoutes.ts (GET /me is matched before GET /:slug)
const RESERVED_SLUGS = new Set(["me"]);

// normalized slug, or null if empty / longer than 255 / reserved
const validateSlug = (value: unknown): string | null => {
    const slug = typeof value === "string" ? generateSlug(value) : "";
    return slug && slug.length <= 255 && !RESERVED_SLUGS.has(slug) ? slug : null;
};

// hex color "#RGB" / "#RRGGBB": undefined if missing/empty, null if invalid
const optionalColor = (value: unknown): string | undefined | null => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") return null;
    const color = value.trim();
    if (!color) return undefined;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : null;
};

// 3-letter currency code ("usd" -> "USD"): undefined if missing/empty, null if invalid
const optionalCurrency = (value: unknown): string | undefined | null => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") return null;
    const code = value.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : null;
};

// create a new store (for authenticated merchant)
// Merchant 登录 → 检查是否已有 Store（一个 merchant 只能有一个）→ 生成 slug → 创建 Store
export const createStore = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // merchant id = the authenticated user's id (from the verified JWT, never from the body)
        const { id: merchantId, role } = req.user!;
        if(!merchantId){
            res.status(401).json({ success: false, message: "Unauthorized:please login to create a store" });
            return;
           
        }
        // platform admin accounts cannot create stores
        if (role === "admin") {
            res.status(403).json({ success: false, message: "Forbidden: Platform admin accounts cannot create stores" });
            return;
        }
        // one store per merchant: check before validating the body
        const existingStore = await prisma.stores.findFirst({
            where: { merchant_id: merchantId },
            select: { id: true, slug: true },
        });
        if (existingStore) {
            res.status(400).json({
                success: false,
                message: "You already have a store",
                store: existingStore,
            });
            return;
        }

        const body = req.body ?? {};

        // name: required non-empty string, max 255
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 255) {
            res.status(400).json({ success: false, message: "Store name is required (max 255 characters)" });
            return;
        }

        // optional fields: undefined = use default, null = invalid
        const fields = {
            description: optionalString(body.description),
            logo_url: optionalString(body.logo_url),
            banner_url: optionalString(body.banner_url),
            currency: optionalCurrency(body.currency),
            shipping_fee: optionalAmount(body.shipping_fee),
            free_shipping_threshold: optionalAmount(body.free_shipping_threshold),
            accent_color: optionalColor(body.accent_color),
        };
        const hero_style = body.hero_style === undefined || body.hero_style === "" ? "hero1" : body.hero_style;
        const invalidFields = Object.entries(fields).filter(([, v]) => v === null).map(([k]) => k);
        if (!VALID_HEROES.includes(hero_style)) invalidFields.push("hero_style");
        if (invalidFields.length) {
            res.status(400).json({ success: false, message: `Invalid fields: ${invalidFields.join(", ")}` });
            return;
        }

        // allow a custom slug, otherwise derive it from the name
        const hasCustomSlug = typeof body.slug === "string" && body.slug.trim();
        const finalSlug = validateSlug(hasCustomSlug ? body.slug : name);
        if (!finalSlug) {
            res.status(400).json({ success: false, message: "Invalid fields: slug" });
            return;
        }

         //check if slug is taken
        const slugTaken = await prisma.stores.findUnique({ where: { slug: finalSlug }, select: { id: true } });
        if (slugTaken) {
            res.status(409).json({ success: false, message: "Store slug is already taken" });
            return;
        }

        const newStore = await prisma.stores.create({
            data: {
                merchant_id: merchantId,
                name,
                slug:finalSlug,
                description: fields.description ?? "",
                logo_url: fields.logo_url ?? "",
                banner_url: fields.banner_url ?? "",
                currency: fields.currency ?? "USD",
                status: "active",
                shipping_fee: fields.shipping_fee ?? 0,
                free_shipping_threshold: fields.free_shipping_threshold ?? 0,
                hero_style,
                accent_color: fields.accent_color ?? "#059669",
                
            }
        })

    // update user role to merchant
    await updateNeonUserRole(merchantId,"merchant");
    res.status(201).json({
        success: true,
        message: "Store created successfully",
        store: newStore

    })

    } catch (error: any) {
        // unique constraint hit by a concurrent request: stores.merchant_id or stores.slug
        if (error?.code === "P2002") {
            const message = JSON.stringify(error.meta ?? {}).includes("merchant_id")
                ? "You already have a store"
                : "Store slug is already taken";
            res.status(409).json({ success: false, message });
            return;
        }
        console.error("createStore:",error);
        res.status(500).json({success: false, message: "Failed to create store"})


    }
}



// get the authenticated merchant's own store (dashboard)
export const getMyStore = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { id, role } = req.user!;

        // platform admin accounts do not own stores
        if (role === "admin") {
            res.status(403).json({ success: false, message: "Platform admin accounts do not have a store" });
            return;
        }

        const store = await prisma.stores.findFirst({ where: { merchant_id: id } });
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }
        res.json({ success: true, store });
    } catch (error: any) {
        console.error("getMyStore error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch store" });
    }
};




// Onboard or elevate user to merchat role
// Onboard or elevate user to merchant role
// Onboard or elevate user to merchant role
export const onboardMerchant = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: "Unauthorized: please login first" });
            return;
        }

        // platform admin 不能变成 merchant
        if (user.role === "admin") {
            res.status(403).json({ success: false, message: "Forbidden: platform admin accounts cannot become merchants" });
            return;
        }

        // 已经是 merchant：直接返回 success，重复调用结果一样（idempotent）
        if (user.role === "merchant") {
            const store = await prisma.stores.findFirst({ where: { merchant_id: user.id } });
            res.json({ success: true, message: "User is already a merchant", role: "merchant", store: store || null });
            return;
        }

        // UPDATE neon_auth.user SET role = 'merchant'，返回受影响的行数
        const updated = await updateNeonUserRole(user.id, "merchant");
        if (updated === 0) {
            res.status(404).json({ success: false, message: "User not found" });
            return;
        }

        // 新 merchant 通常还没有 store，返回 null，frontend 可以据此跳转到 create store
        const store = await prisma.stores.findFirst({ where: { merchant_id: user.id } });

        res.json({
            success: true,
            message: "User elevated to merchant",
            role: "merchant",
            store: store || null,
        });
    } catch (error: any) {
        console.error("onboardMerchant error:", error);
        res.status(500).json({ success: false, message: "Failed to onboard merchant" });
    }
};





// get a public store by slug (storefront) — merchant_id is not exposed
export const getStoreBySlug = async (req: Request, res: Response): Promise<void> => {
    try {
        const slug = typeof req.params.slug === "string" ? req.params.slug : "";
        if (!slug) {
            res.status(400).json({ success: false, message: "Store slug is required" });
            return;
        }

        const store = await prisma.stores.findUnique({
            where: { slug },
            omit: { merchant_id: true },
        });
        if (!store || store.status !== "active") {
            res.status(404).json({ success: false, message: "Store not found" });
            return;
        }
        res.json({ success: true, store });
    } catch (error: any) {
        console.error("getStoreBySlug error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch store" });
    }
};

// allowed storefront hero layouts
const VALID_HEROES = ["hero1", "hero2", "hero3"];

// parse a client-supplied ID: only positive safe integers are valid, otherwise null
const parseId = (value: unknown): number | null => {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};

// non-negative money amount: undefined if missing, null if invalid
const optionalAmount = (value: unknown): number | undefined | null => {
    if (value === undefined || value === "") return undefined;
    const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(num) && num >= 0 && num < 1e8 ? Math.round(num * 100) / 100 : null;
};

// PUT:update the authenticated merchant's store settings
// 只更新 body 里传了的字段；status 只能由 admin 修改
export const updateStoreSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { id, role } = req.user!;

        // platform admin accounts cannot edit stores through the merchant endpoint
        if (role === "admin") {
            res.status(403).json({ success: false, message: "Platform admin accounts cannot update store settings" });
            return; 
        }

        const store = await prisma.stores.findFirst({
            where: { merchant_id: id },
            select: { id: true, slug: true },
        });
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        const {
            name, slug, description, logo_url, banner_url, currency,
            shipping_fee, free_shipping_threshold, hero_style, accent_color,
        } = req.body ?? {};

        // text fields: only the ones sent are validated; "" clears an optional field, name/currency cannot be blank
        const rawText = { name, description, logo_url, banner_url, currency };
        const text = {
            name: optionalString(name, 255),
            description: optionalString(description),
            logo_url: optionalString(logo_url),
            banner_url: optionalString(banner_url),
            currency: optionalCurrency(currency),
        };
        const invalidFields = Object.entries(text).filter(([, v]) => v === null).map(([k]) => k);
        if (name !== undefined && text.name === undefined) invalidFields.push("name");
        if (currency !== undefined && text.currency === undefined) invalidFields.push("currency");
        if (hero_style !== undefined && !VALID_HEROES.includes(hero_style)) invalidFields.push("hero_style");
        const color = optionalColor(accent_color);
        if (color === null) invalidFields.push("accent_color");

        // money fields must be non-negative numbers, otherwise Number() gives NaN and Prisma throws
        invalidFields.push(
            ...Object.entries({ shipping_fee, free_shipping_threshold })
                .filter(([, v]) => v !== undefined && optionalAmount(v) === null)
                .map(([k]) => k),
        );
        if (invalidFields.length) {
            res.status(400).json({ success: false, message: `Invalid fields: ${invalidFields.join(", ")}` });
            return;
        }

        // slug (must stay unique); only update when it actually changes
        let newSlug: string | undefined;
        if (slug !== undefined) {
            newSlug = validateSlug(slug) ?? undefined;
            if (!newSlug) {
                res.status(400).json({ success: false, message: "Invalid fields: slug" });
                return;
            }
            if (newSlug === store.slug) {
                newSlug = undefined;
            } else {
                const slugTaken = await prisma.stores.findUnique({ where: { slug: newSlug }, select: { id: true } });
                if (slugTaken) {
                    res.status(409).json({ success: false, message: "Store slug is already taken" });
                    return;
                }
            }
        }

        const updated = await prisma.stores.update({
            where: { id: store.id },
            data: {
                ...Object.fromEntries(
                    (Object.keys(text) as Array<keyof typeof text>)
                        .filter((k) => rawText[k] !== undefined)
                        .map((k) => [k, text[k] ?? ""]),
                ),
                ...(newSlug && { slug: newSlug }),
                ...(shipping_fee !== undefined && { shipping_fee: Number(shipping_fee) }),
                ...(free_shipping_threshold !== undefined && {
                    free_shipping_threshold: Number(free_shipping_threshold)
                }),
                ...(hero_style !== undefined && { hero_style }),
                // "" resets accent_color to the default
                ...(accent_color !== undefined && { accent_color: color ?? "#059669" }),
            }
        })
        res.json({ success: true, store: updated });
    } catch (error: any) {
        if (error?.code === "P2002") {
            res.status(409).json({ success: false, message: "Store slug is already taken" });
            return;
        }
        console.error("updateStoreSettings error:", error);
        res.status(500).json({ success: false, message: "Failed to update store settings" });
    }
};



// ADMIN: get all stores with stats (productCount, orderCount, revenue)
// revenue = 所有未取消订单的 total 之和
export const getAllStores = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const [stores, revenueRows] = await Promise.all([
            prisma.stores.findMany({
                include: { 
                    _count: { select: { products: true, orders: true, categories: true } } },
                    orderBy: { created_at: "desc" },
            }),
            prisma.orders.groupBy({
                by: ["store_id"],
                where: { NOT: { order_status: "cancelled" } },
                _sum: { total: true },
            }),
        ]);

        const revenueByStore = new Map(
            revenueRows.map((row) => [row.store_id, Number(row._sum.total ?? 0)])
        );

        const result = stores.map(({ _count, ...store }) => ({
            ...store,
            stats: {
                productCount: _count.products,
                orderCount: _count.orders,
                categoryCount: _count.categories,
                revenue: revenueByStore.get(store.id) ?? 0,
            },
        }));

        res.json({ success: true, stores: result });
    } catch (error: any) {
        console.error("getAllStores error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch stores" });
    }
};

// ADMIN: get all merchants (role = merchant, or anyone who owns a store) with their store
// neon_auth.user 不在 schema.prisma 里，所以用 raw SQL
export const getAllMerchants = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const merchants = await prisma.$queryRaw<
            Array<{ id: string; name: string | null; email: string; role: string | null; createdAt: Date | null }>
        >`
            SELECT u.id, u.name, u.email, u.role, u."createdAt"
            FROM neon_auth.user u
            WHERE u.role = 'merchant'
               OR EXISTS (SELECT 1 FROM public.stores s WHERE s.merchant_id = u.id)
            ORDER BY u."createdAt" DESC
        `;

        const stores = await prisma.stores.findMany({
            where: { merchant_id: { in: merchants.map((m) => m.id) } },
            select: { id: true, name: true, slug: true, status: true, merchant_id: true },
        });
        const storeByMerchant = new Map(stores.map(({ merchant_id, ...s }) => [merchant_id, s]));

        const result = merchants.map((m) => ({
            ...m,
            store: storeByMerchant.get(m.id) ?? null,
        }));

        res.json({ success: true, merchants: result });
    } catch (error: any) {
        console.error("getAllMerchants error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch merchants" });
    }
};

// ADMIN: toggle store status active <-> inactive
// inactive 的店铺在 getStoreBySlug（storefront）里返回 404
export const toggleStoreStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const storeId = parseId(req.params.id);
        if (!storeId) {
            res.status(400).json({ success: false, message: "Store id must be a positive integer" });
            return;
        }

        const store = await prisma.stores.findUnique({ where: { id: storeId }, select: { status: true } });
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found" });
            return;
        }

        const status = store.status === "active" ? "inactive" : "active";
        const updated = await prisma.stores.update({
            where: { id: storeId },
            data: { status },
            select: { id: true, name: true, slug: true, status: true },
        });

        res.json({ success: true, message: `Store is now ${status}`, store: updated });
    } catch (error: any) {
        console.error("toggleStoreStatus error:", error);
        res.status(500).json({ success: false, message: "Failed to toggle store status" });
    }
};

// STORE CONTROLLER
// │
// ├── POST: onboardMerchant()
// │   ├── Already merchant/admin → return as-is
// │   └── UPDATE neon_auth.user SET role = 'merchant'
// │
// ├── POST: createStore()
// │   ├── Require merchant role
// │   ├── Validate name / slug / optional fields
// │   ├── One store per merchant, slug must be unique
// │   ├── prisma.stores.create()
// │   └── Return 201 + new store
// │
// ├── GET: getMyStore()
// │   └── Find store by merchant_id = req.user.id
// │
// ├── GET: getStoreBySlug()
// │   └── Public storefront lookup (active stores only, merchant_id hidden)
// │
// ├── PUT: updateStoreSettings()
// │   ├── Find merchant's store
// │   ├── Validate only the fields sent (status is admin-only)
// │   └── prisma.stores.update()
// │
// └── ADMIN
//     ├── GET: getAllStores()      → stores + productCount / orderCount / categoryCount / revenue
//     ├── GET: getAllMerchants()   → neon_auth.user (merchant or store owner) + their store
//     └── PATCH: toggleStoreStatus() → active <-> inactive
