import React, { useEffect, useState } from "react";
import { api } from "../../config/api";
import { MerchantLayout } from "../../components/MerchantLayout";
import toast from "react-hot-toast";
import { OrderTable, type OrderItem } from "../../components/merchant/orders/OrderTable";
import { OrderDetailModal } from "../../components/merchant/orders/OrderDetailModal";

// 后端 getMerchantOrders 默认一页 20 条，最多 100 条；这里先一次拿 100 条
const PAGE_LIMIT = 100;

export const OrdersPage: React.FC = () => {
    // 不需要 useAuth：/api/orders/merchant 后端靠 token 自己找店
    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("all");
    const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [trackingInput, setTrackingInput] = useState("");

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            try {
                // filter 交给后端：?status=shipped
                const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
                if (filterStatus !== "all") params.set("status", filterStatus);

                const { data } = await api.get(`/api/orders/merchant?${params}`);
                if (data.success) setOrders(data.orders);
            } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to load orders");
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, [filterStatus]);

    const handleUpdateOrder = async (orderId: number, status: string, tracking?: string, payment?: string) => {
        setUpdatingStatus(true);
        try {
            // 只发有值的字段；后端 PATCH 没收到的字段保持不变
            const body: Record<string, string | null> = { order_status: status };
            if (tracking !== undefined) body.tracking_number = tracking;
            if (payment !== undefined) body.payment_status = payment;

            const { data } = await api.patch(`/api/orders/merchant/${orderId}/status`, body);

            // 用后端返回的 order 更新列表和弹窗，保证和数据库一致
            const updated: OrderItem = data.order;
            setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
            setSelectedOrder((prev) => (prev?.id === orderId ? updated : prev));
            toast.success("Order updated!");
        } catch (err: any) {
            // 例如 409：shipped 不能改回 placed
            toast.error(err.response?.data?.message || "Failed to update order");
        } finally {
            setUpdatingStatus(false);
        }
    };

    return (
        <MerchantLayout>
            <div className="space-y-7 font-sans">
                <h1 className="text-xl sm:text-2xl text-slate-900 mt-10">Orders & Fulfillment</h1>
                <OrderTable
                    orders={orders}
                    loading={loading}
                    filterStatus={filterStatus}
                    onFilterChange={setFilterStatus}
                    onUpdateOrderStatus={(id, status) => handleUpdateOrder(id, status)}
                    onOpenDetails={(o) => {
                        setSelectedOrder(o);
                        setTrackingInput(o.tracking_number || "");
                    }}
                />
                <OrderDetailModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    trackingInput={trackingInput}
                    onTrackingInputChange={setTrackingInput}
                    onUpdateOrder={handleUpdateOrder}
                    updatingStatus={updatingStatus}
                />
            </div>
        </MerchantLayout>
    );
};
