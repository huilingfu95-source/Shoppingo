import React, { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { api } from "../../config/api";
import { formatVariant } from "../../utils/variant";
import { StoreNavbar } from "../../components/StoreNavbar";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { getStoreAccentStyles } from "../../utils/storeAccent";

export const OrderConfirmation: React.FC = () => {
    const { storeSlug, orderNumber } = useParams<{ storeSlug: string; orderNumber: string }>();
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [searchParams] = useSearchParams();
    const email = searchParams.get("email") || "";

    useEffect(() => {
        if (!orderNumber) return;
        // GET /api/orders/receipt/:orderNumber：登录用户靠 token；游客要带 ?email=（下单时填的）
        const query = email ? `?email=${encodeURIComponent(email)}` : "";
        api.get(`/api/orders/receipt/${encodeURIComponent(orderNumber)}${query}`)
            .then(({ data }) => {
                if (!data.success) return;
                const r = data.receipt;
                const addr = r.shipping_address || {};
                // 后端字段 → 页面用的字段
                setOrder({
                    ...r,
                    store_name: r.store?.name,
                    store_slug: r.store?.slug,
                    items: (Array.isArray(r.items) ? r.items : []).map((it: any) => ({
                        ...it,
                        price: Number(it.price),
                        variant: formatVariant(it.variant),
                    })),
                    shipping_address: {
                        street: [addr.line1, addr.line2].filter(Boolean).join(", "),
                        city: addr.city,
                        state: addr.state,
                        zip: addr.postal_code,
                        country: addr.country,
                    },
                });
            })
            .catch((err) => console.error("Failed to load receipt:", err))   // 404 → 显示 Order Not Found
            .finally(() => setLoading(false));
    }, [orderNumber, email]);

    if (loading)
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">Loading order receipt...</div>
        );
    if (!order)
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Order Not Found</h2>
                <Link to={`/store/${storeSlug}`} className="text-xs font-semibold text-blue-600">
                    Return to Store
                </Link>
            </div>
        );

    const items = Array.isArray(order.items) ? order.items : [];
    const addr = order.shipping_address || {};
    const store = {
        name: order.store_name,
        slug: order.store_slug,
        logo_url: order.store_logo,
        accent_color: order.store_accent_color,
    };

    return (
        <div
            className="min-h-screen text-slate-900 flex flex-col font-sans"
            style={getStoreAccentStyles(order.store_accent_color)}
        >
            <StoreNavbar store={store} />
            <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 w-full flex-1">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-medium tracking-tight text-slate-900">Thank you for your order</h1>
                    <p className="text-xs text-slate-500 mt-1">We've received your order and are getting it ready for shipment.</p>
                    <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 bg-slate-100 rounded-xs text-xs font-mono font-medium text-slate-800">
                        Order #{order.order_number}
                    </div>
                </div>

                {/* Status */}
                <div className="bg-white rounded-md border border-slate-200 p-5 mb-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Status</span>
                            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-xs border uppercase tracking-wide store-accent-pill">
                                {order.order_status}
                            </span>
                        </div>
                        {order.tracking_number && (
                            <div>
                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                                    Tracking Code
                                </span>
                                <span className="font-mono text-xs font-medium text-slate-900 mt-1 block">{order.tracking_number}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Items + Summary */}
                <div className="bg-white rounded-md border border-slate-200 overflow-hidden mb-6">
                    <div className="p-4 border-b border-slate-100">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-900">Items Ordered</h2>
                    </div>
                    <div className="divide-y divide-slate-100 p-4">
                        {items.map((item: any, idx: number) => (
                            <div key={idx} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xs bg-slate-100 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                                        {item.image ? (
                                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <ShoppingBag className="w-4 h-4 text-slate-400" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-slate-900 truncate">{item.name}</p>
                                        <p className="text-[11px] text-slate-400">
                                            Qty: {item.quantity} {item.variant ? `• ${item.variant}` : ""}
                                        </p>
                                    </div>
                                </div>
                                <span className="font-mono font-medium text-slate-900">${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Price breakdown */}
                    <div className="bg-creampink-50/60 p-4 border-t border-slate-100 text-xs space-y-2">
                        {[
                            { label: "Subtotal", value: `$${Number(order.subtotal).toFixed(2)}`, cls: "text-slate-600" },
                            ...(Number(order.discount) > 0
                                ? [
                                      {
                                          label: "Discount",
                                          value: `-$${Number(order.discount).toFixed(2)}`,
                                          cls: "store-accent-text font-medium",
                                      },
                                  ]
                                : []),
                            {
                                label: "Shipping",
                                value: Number(order.shipping_cost) === 0 ? "FREE" : `$${Number(order.shipping_cost).toFixed(2)}`,
                                cls: "text-slate-600",
                            },
                        ].map(({ label, value, cls }) => (
                            <div key={label} className={`flex justify-between ${cls}`}>
                                <span>{label}</span>
                                <span className="font-mono font-medium text-slate-900">{value}</span>
                            </div>
                        ))}
                        <div className="flex justify-between text-sm font-semibold text-slate-900 pt-2 border-t border-slate-200">
                            <span>Total</span>
                            <span className="font-mono font-bold">${Number(order.total).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Address + Payment */}
                    <div className="p-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                            <span className="font-medium text-slate-400 uppercase tracking-wider block mb-1 text-[10px]">
                                Delivery To
                            </span>
                            <p className="font-medium text-slate-900">{order.customer_name}</p>
                            <p className="text-slate-600">{addr.street}</p>
                            <p className="text-slate-600">
                                {addr.city}, {addr.state} {addr.zip}
                            </p>
                            <p className="text-slate-600">{addr.country}</p>
                        </div>
                        <div>
                            <span className="font-medium text-slate-400 uppercase tracking-wider block mb-1 text-[10px]">
                                Payment Details
                            </span>
                            <p className="text-slate-900 font-medium">Cash on Delivery (COD)</p>
                            <p className={`mt-1 font-medium ${order.payment_status === "paid" ? "store-accent-text" : "text-amber-700"}`}>
                                Status: {order.payment_status.toUpperCase()}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="text-center">
                    <Link
                        to={`/store/${storeSlug}`}
                        className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 hover:text-slate-900 transition"
                    >
                        Continue Shopping <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </main>
        </div>
    );
};
