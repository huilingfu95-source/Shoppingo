import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../config/api";
import { fetchStoreBySlug } from "../../utils/publicApi";
import { useAuth } from "../../context/AuthContext";
import { StoreNavbar } from "../../components/StoreNavbar";
import { ShoppingBag, ArrowLeft, Truck } from "lucide-react";
import { getStoreAccentStyles } from "../../utils/storeAccent";

export const CustomerOrders: React.FC = () => {
    const { storeSlug } = useParams<{ storeSlug: string }>();
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    const [orders, setOrders] = useState<any[]>([]);
    const [store, setStore] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!storeSlug || authLoading) return;
        if (!user) {
            navigate(`/store/${storeSlug}/login`);
            return;
        }
        const load = async () => {
            try {
                // my-orders 是这个用户在所有店的订单（靠 token），前端只留当前这家店的
                const [currentStore, { data }] = await Promise.all([
                    fetchStoreBySlug(storeSlug),
                    api.get("/api/orders/customer/my-orders?limit=100"),
                ]);
                setStore(currentStore);
                if (data.success) setOrders(data.orders.filter((o: any) => o.stores?.slug === storeSlug));
            } catch (err) {
                console.error("Failed to load orders:", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [storeSlug, user, authLoading, navigate]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white text-slate-400 text-xs font-mono">
                Loading orders...
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-creampink-50 text-slate-900 flex flex-col font-sans"
            style={getStoreAccentStyles(store?.accent_color)}
        >
            {store && <StoreNavbar store={store} />}

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full flex-1">
                <Link
                    to={`/store/${storeSlug}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-6 transition"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Store
                </Link>

                <h1 className="text-xl font-medium tracking-tight text-slate-900 mb-6">Order History</h1>

                {orders.length === 0 ? (
                    <div className="bg-white rounded-md border border-slate-200 p-12 text-center">
                        <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-sm font-semibold text-slate-900 mb-1">No orders yet</h3>
                        <p className="text-xs text-slate-500 mb-5">You haven't placed any orders with this store yet.</p>
                        <Link
                            to={`/store/${storeSlug}`}
                            className="px-4 py-2 store-accent-btn text-xs font-semibold rounded-full transition shadow-xs"
                        >
                            Browse Products
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {orders.map((o) => (
                            <div
                                key={o.id}
                                className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 transition"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                                    <div>
                                        <span className="text-[10px] font-mono text-slate-400 block">Order #{o.order_number}</span>
                                        <span className="text-xs text-slate-500">
                                            Placed on {new Date(o.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-xs border uppercase tracking-wide store-accent-pill">
                                            {o.order_status}
                                        </span>
                                        <Link
                                            to={`/store/${storeSlug}/order-confirmation/${o.order_number}`}
                                            className="text-xs font-medium hover:underline ml-1 store-accent-text"
                                        >
                                            View Receipt →
                                        </Link>
                                    </div>
                                </div>

                                <div className="pt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                                    <div>
                                        <p className="text-slate-600">
                                            {(o.items || []).length} items • Delivery to {o.customer_name}
                                        </p>
                                        {o.tracking_number && (
                                            <p className="font-mono text-slate-800 font-medium mt-1 flex items-center gap-1">
                                                <Truck className="w-3.5 h-3.5 text-slate-500" /> Tracking: {o.tracking_number}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-bold font-mono text-slate-900">${Number(o.total).toFixed(2)}</span>
                                        <span className="block text-[11px] text-slate-400 capitalize">
                                            {o.payment_method} ({o.payment_status})
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};
