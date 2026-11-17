import React from "react";
import { Spinner } from "../../common/Spinner";
import { ORDER_STATUSES, orderStatusOptions, label } from "./orderStatus";

export interface OrderItem {
    id: number;
    order_number: string;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    items: any[];
    total: number | string;
    subtotal: number | string;
    discount?: number | string;
    shipping_cost: number | string;
    payment_status: string;
    order_status: string;
    tracking_number?: string;
    shipping_address?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
    };
}

interface OrderTableProps {
    orders: OrderItem[];
    loading: boolean;
    filterStatus: string;
    onFilterChange: (status: string) => void;
    onUpdateOrderStatus: (orderId: number, status: string) => void;
    onOpenDetails: (order: OrderItem) => void;
}

const STATUS_FILTERS = ["all", ...ORDER_STATUSES];

export const OrderTable: React.FC<OrderTableProps> = ({
    orders,
    loading,
    filterStatus,
    onFilterChange,
    onUpdateOrderStatus,
    onOpenDetails,
}) => {
    return (
        <div className="space-y-6">
            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {STATUS_FILTERS.map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => onFilterChange(s)}
                        className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition cursor-pointer ${
                            filterStatus === s
                                ? "bg-zhuyue-600 text-white shadow-xs"
                                : "bg-white text-slate-600 border border-slate-200/80 hover:bg-creampink-50/50 hover:text-zhuyue-800"
                        }`}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden">
                {loading ? (
                    <Spinner padded />
                ) : orders.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400 font-mono">No orders found in this category.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-creampink-50/70 text-slate-400 font-medium border-b border-slate-100">
                                <tr>
                                    <th className="p-3.5 pl-6">Order #</th>
                                    <th className="p-3.5">Customer</th>
                                    <th className="p-3.5">Items</th>
                                    <th className="p-3.5">Total</th>
                                    <th className="p-3.5">Payment</th>
                                    <th className="p-3.5">Fulfillment</th>
                                    <th className="p-3.5 pr-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orders.map((o) => (
                                    <tr key={o.id} className="hover:bg-creampink-50/50 transition">
                                        <td className="p-3.5 pl-6 font-mono font-medium text-slate-900">{o.order_number}</td>
                                        <td className="p-3.5">
                                            <span className="font-medium text-slate-900 block">{o.customer_name}</span>
                                            <span className="text-[11px] text-slate-400">{o.customer_email}</span>
                                        </td>
                                        <td className="p-3.5 text-slate-600">{(o.items || []).length} items</td>
                                        <td className="p-3.5 font-mono font-medium text-slate-900">${Number(o.total).toFixed(2)}</td>
                                        <td className="p-3.5">
                                            <span
                                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase border ${
                                                    o.payment_status === "paid"
                                                        ? "bg-creampink-50 text-zhuyue-700 border-creampink-200"
                                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                                }`}
                                            >
                                                {o.payment_status}
                                            </span>
                                        </td>
                                        <td className="p-3.5">
                                            <select
                                                value={o.order_status || "placed"}
                                                // 只列出后端允许的下一步；delivered / cancelled 是终点，直接锁住
                                                disabled={orderStatusOptions(o.order_status).length === 1}
                                                onChange={(e) => onUpdateOrderStatus(o.id, e.target.value)}
                                                className="px-3 py-1 text-xs border border-slate-200 rounded-full bg-creampink-50/50 font-medium capitalize focus:outline-none focus:border-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {orderStatusOptions(o.order_status).map((s) => (
                                                    <option key={s} value={s}>{label(s)}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="p-3.5 pr-6 text-right">
                                            <button
                                                type="button"
                                                onClick={() => onOpenDetails(o)}
                                                className="px-4 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-full text-slate-800 transition cursor-pointer"
                                            >
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
