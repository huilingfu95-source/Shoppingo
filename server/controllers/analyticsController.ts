import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { countNeonMerchants } from "../services/neonUser.js";

const LOW_STOCK_THRESHOLD = 5;
const TOP_LIMIT = 5;

// orders that count toward revenue (merchant and admin): paid only
const PAID_FILTER = Prisma.sql`o.payment_status = 'paid'`;

const round2 = (n: number) => Math.round(n * 100) / 100;

// GET: analytics for the authenticated merchant's store
export const getMerchantAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const store = await prisma.stores.findFirst({
            where: { merchant_id: req.user!.id },
            select: { id: true },
        });
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        const [[stats], totalProducts, lowStockCount, recentOrders] = await Promise.all([
            // all order stats in one pass over the store's orders
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
            prisma.$queryRaw<{ id: number; name: string; slug: string; status: string; orders: number; revenue: number }[]>`
                SELECT s.id, s.name, s.slug, COALESCE(s.status, 'active') AS status,
                       COUNT(o.id)::int AS orders,
                       SUM(o.total) FILTER (WHERE ${PAID_FILTER})::float8 AS revenue
                FROM stores s
                JOIN orders o ON o.store_id = s.id
                GROUP BY s.id
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
