import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { updateNeonUserRole, findNeonMerchants } from "../services/neonUser.js";

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
            res.status(403).json({ success: false, message: "Forbbiden: Platform admin accounts cannot create stores" });
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

        const {name,slug,description,logo_url,banner_url,currency="USD",shipping_fee=0,free_shipping_threshold=0,
            hero_style="hero1",accent_color="#059669"} = req.body;

        if (!name || name.length > 255) {
            res.status(400).json({ success: false, message: "Store name is required (max 255 characters)" });
            return;
        }

        // allow a custom slug, otherwise derive it from the name
        const rawSlug = typeof req.body?.slug === "string" && req.body.slug.trim() ? req.body.slug : name;
        const finalSlug = generateSlug(rawSlug);

         //check if slug is taken
        const slugTaken = await prisma.stores.findUnique({ where: { slug: finalSlug }, select: { id: true } });
        if (slugTaken) {
            res.status(409).json({ success: false, message: "Store slug is already taken" });
            return;
        }

        const newStore = await prisma.stores.create({
            data: {
                merchant_id: merchantId,
                name: name.trim(),
                slug:finalSlug,
                description: description || "",
                logo_url: logo_url  || "",
                banner_url: banner_url || "",
                currency,
                status: "active",
                shipping_fee: Number(shipping_fee) || 0,
                free_shipping_threshold: Number(free_shipping_threshold) || 0,
                hero_style,
                accent_color:accent_color?.trim() || "#059669",
                
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

        // money fields must be non-negative numbers, otherwise Number() gives NaN and Prisma throws
        const invalidAmounts = Object.entries({ shipping_fee, free_shipping_threshold })
            .filter(([, v]) => v !== undefined && optionalAmount(v) === null)
            .map(([k]) => k);
        if (invalidAmounts.length) {
            res.status(400).json({ success: false, message: `Invalid fields: ${invalidAmounts.join(", ")}` });
            return;
        }

        // slug (must stay unique); only update when it actually changes
        let newSlug: string | undefined;
        if (slug !== undefined) {
            newSlug = typeof slug === "string" ? generateSlug(slug) : "";
            if (!newSlug || newSlug.length > 255) {
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
                    Object.entries({ name, description, logo_url, banner_url, currency }).
                        filter(([, v]) => v !== undefined),
                ),
                ...(newSlug && { slug: newSlug }),
                ...(shipping_fee !== undefined && { shipping_fee: Number(shipping_fee) }),
                ...(free_shipping_threshold !== undefined && {
                    free_shipping_threshold: Number(free_shipping_threshold)
                }),
                ...(hero_style && VALID_HEROES.includes(hero_style) && { hero_style }),
                ...(accent_color !== undefined && {
                    accent_color: String(accent_color).trim() || "#059669"
                }),
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
                include: { _count: { select: { products: true, orders: true, categories: true } } },
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
// neon_auth.user 的 raw SQL 在 services/neonUser.ts (findNeonMerchants)
export const getAllMerchants = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const merchants = await findNeonMerchants();

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

// ADMIN: toggle store status active <-> suspended
// suspended 的店铺在 getStoreBySlug（storefront）里返回 404
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

        const status = store.status === "active" ? "suspended" : "active";
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
// │   ├── No user → 401; admin → 403 (admin cannot become merchant)
// │   ├── Already merchant → return success + store (idempotent)
// │   ├── updateNeonUserRole(id, "merchant") → 0 rows affected → 404
// │   └── Return role + store (usually null → frontend goes to create store)
// │
// ├── POST: createStore()
// │   ├── merchantId from req.user (verified JWT), admin → 403
// │   ├── One store per merchant → 400 + existing store
// │   ├── Validate name (required, max 255)
// │   ├── slug = custom slug or name → generateSlug(); taken → 409
// │   ├── prisma.stores.create() with defaults (USD, hero1, #059669, status active)
// │   ├── updateNeonUserRole(id, "merchant")
// │   └── Return 201 + new store
// │
// ├── GET: getMyStore()
// │   ├── admin → 403
// │   └── Find store by merchant_id = req.user.id → 404 if none
// │
// ├── GET: getStoreBySlug()  (public)
// │   └── Storefront lookup: active stores only, merchant_id omitted → 404 otherwise
// │
// ├── PUT: updateStoreSettings()
// │   ├── admin → 403; find merchant's store → 404 if none
// │   ├── Only update fields sent in body (status is admin-only)
// │   ├── shipping_fee / free_shipping_threshold: non-negative amount → else 400
// │   ├── slug: generateSlug(), skip if unchanged, taken → 409 (P2002 → 409 as fallback)
// │   ├── hero_style only if in VALID_HEROES; empty accent_color → #059669
// │   └── prisma.stores.update()
// │
// └── ADMIN
//     ├── GET: getAllStores()      → stores + productCount / orderCount / categoryCount
//     │                              + revenue (sum of non-cancelled order totals)
//     ├── GET: getAllMerchants()   → findNeonMerchants() (service: role = merchant or store owner)
//     │                              + their store (id / name / slug / status)
//     └── PATCH: toggleStoreStatus() → parseId → 400; not found → 404; active <-> suspended
