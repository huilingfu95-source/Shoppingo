import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { countNeonMerchants } from "../services/neonUser.js";

// ============================================================================
// Analytics Controller：给 dashboard 首页"算数字"
// 只读数据库（count / sum），不改任何数据
//
// 两个 API：
//   GET /api/analytics/merchant  → getMerchantAnalytics：merchant 看自己这家店
//   GET /api/analytics/platform  → getPlatformAnalytics：admin 看整个平台
//
// 好比每天关门后对账：卖了多少钱？几单？几单没发货？什么快卖完了？
//
//   Frontend Dashboard
//        │ GET /api/analytics/merchant（带 JWT）
//        ▼
//   requireAuth：验证 JWT → req.user.id
//        ▼
//   getMerchantAnalytics
//        ├─ 用 req.user.id 找到自己的 store（找不到 → 404）
//        ├─ Promise.all 同时跑 4 个查询：
//        │     ① 订单统计（营收、订单数、待处理、已送达）
//        │     ② 商品总数
//        │     ③ 低库存商品数
//        │     ④ 最近 5 笔订单
//        ▼
//   res.json({ success, analytics })  → Dashboard 卡片上的数字
// ============================================================================

const LOW_STOCK_THRESHOLD = 5;
const TOP_LIMIT = 5;

// orders that count toward revenue (merchant and admin): paid only
const PAID_FILTER = Prisma.sql`o.payment_status = 'paid'`;

const round2 = (n: number) => Math.round(n * 100) / 100;

// GET: analytics for the authenticated merchant's store
// 返回：totalRevenue 总营收 | totalOrders 订单数 | avgOrderValue 平均客单价
//      pendingOrders 待处理 | deliveredOrders 已送达
//      totalProducts 商品数 | lowStockCount 低库存数 | recentOrders 最近 5 单
export const getMerchantAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // ① 找到"我"的店：merchant_id 来自 JWT，前端没法冒充别人的店
        const store = await prisma.stores.findFirst({
            where: { merchant_id: req.user!.id },
            select: { id: true },
        });
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        // ② 4 个查询同时跑（Promise.all），比一个一个等更快
        const [[stats], totalProducts, lowStockCount, recentOrders] = await Promise.all([
            // all order stats in one pass over the store's orders
            // FILTER (WHERE ...) = 只统计符合条件的行；扫一遍就同时算出 5 个数字
            prisma.$queryRaw<{
                orders: number; revenue: number; revenue_orders: number; pending: number; delivered: number;
            }[]>`
                SELECT COUNT(*)::int AS orders,
                       COALESCE(SUM(o.total) FILTER (WHERE ${PAID_FILTER}), 0)::float8 AS revenue,
                       (COUNT(*) FILTER (WHERE ${PAID_FILTER}))::int AS revenue_orders,
                       -- not yet finished: placed + confirmed + processing
                       (COUNT(*) FILTER (WHERE COALESCE(o.order_status, 'placed')
                           IN ('placed', 'confirmed', 'processing')))::int AS pending,
                       (COUNT(*) FILTER (WHERE o.order_status = 'delivered'))::int AS delivered
                FROM orders o
                WHERE o.store_id = ${store.id}`,
            prisma.products.count({ where: { store_id: store.id } }),
            // active products at or below LOW_STOCK_THRESHOLD
            prisma.products.count({
                where: { store_id: store.id, status: "active", stock: { lte: LOW_STOCK_THRESHOLD } },
            }),
            prisma.orders.findMany({
                where: { store_id: store.id },
                select: {
                    id: true, order_number: true, customer_name: true, total: true,
                    order_status: true, payment_status: true, created_at: true,
                },
                orderBy: { created_at: "desc" },
                take: TOP_LIMIT,
            }),
        ]);

        // ③ 组装成前端要的格式返回
        res.json({
            success: true,
            analytics: {
                totalRevenue: round2(stats.revenue),
                totalOrders: stats.orders,
                avgOrderValue: stats.revenue_orders ? round2(stats.revenue / stats.revenue_orders) : 0,
                pendingOrders: stats.pending,
                deliveredOrders: stats.delivered,
                totalProducts,
                lowStockCount,
                recentOrders,
            },
        });
    } catch (error: any) {
        console.error("getMerchantAnalytics error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch merchant analytics" });
    }
};

// GET: platform-wide analytics for admins
// 和上面一样是"对账"，但对象是整个平台：多少家店、多少 merchant、总营收、哪几家店卖得最好
//
//   Admin Dashboard → GET /api/analytics/platform → requireRole(["admin"])
//        ▼
//   Promise.all 同时跑 7 个查询：
//        店铺总数 / 营业中 / 被封 / merchant 人数（Neon Auth）/ 订单总数 / 总营收 / Top 5 店铺
//        ▼
//   res.json({ success, analytics })
export const getPlatformAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const [totalStores, activeStores, suspendedStores, totalMerchants, totalOrders,
            paidAgg, topStores] = await Promise.all([
            prisma.stores.count(),
            // NULL status = column default "active"
            prisma.stores.count({ where: { OR: [{ status: "active" }, { status: null }] } }),
            prisma.stores.count({ where: { status: "suspended" } }),
            countNeonMerchants(),
            prisma.orders.count(),
            // revenue = sum of paid orders
            prisma.orders.aggregate({ where: { payment_status: "paid" }, _sum: { total: true } }),
            // top stores by paid revenue, with order count (stores without sales excluded)
            prisma.$queryRaw<{ id: number; name: string; slug: string; status: string; merchant_name: string | null; orders: number; revenue: number }[]>`
                SELECT s.id, s.name, s.slug, COALESCE(s.status, 'active') AS status,
                       u.name AS merchant_name,
                       COUNT(o.id)::int AS orders,
                       SUM(o.total) FILTER (WHERE ${PAID_FILTER})::float8 AS revenue
                FROM stores s
                JOIN orders o ON o.store_id = s.id
                LEFT JOIN neon_auth.user u ON u.id = s.merchant_id
                GROUP BY s.id, u.name
                HAVING SUM(o.total) FILTER (WHERE ${PAID_FILTER}) > 0
                ORDER BY revenue DESC, s.id
                LIMIT ${TOP_LIMIT}`,
        ]);

        const totalRevenue = Number(paidAgg._sum.total) || 0;

        res.json({
            success: true,
            analytics: {
                totalStores,
                activeStores,
                suspendedStores,
                totalMerchants,
                totalOrders,
                totalRevenue,
                // average paid revenue per store (all stores, including ones without sales)
                avgRevenuePerStore: totalStores ? round2(totalRevenue / totalStores) : 0,
                topStores,
            },
        });
    } catch (error: any) {
        console.error("getPlatformAnalytics error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch platform analytics" });
    }
};
