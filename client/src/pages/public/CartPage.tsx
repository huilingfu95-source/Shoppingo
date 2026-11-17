import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { fetchStoreBySlug } from "../../utils/publicApi";
import { StoreNavbar } from "../../components/StoreNavbar";
import { ShoppingBag, ArrowRight, ArrowLeft } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { CartShippingProgress } from "../../components/public/cart/CartShippingProgress";
import { CartItemList } from "../../components/public/cart/CartItemList";
import { CartSummarySidebar } from "../../components/public/cart/CartSummarySidebar";
import { getStoreAccentStyles } from "../../utils/storeAccent";

export const CartPage: React.FC = () => {
    const { storeSlug } = useParams<{ storeSlug: string }>();
    const { cart, updateQuantity, removeFromCart, subtotal, setStoreSlug } = useCart();
    const navigate = useNavigate();

    const [store, setStore] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (storeSlug) {
            setStoreSlug(storeSlug);
            // 需要真实的 shipping_fee / free_shipping_threshold 来算运费
            fetchStoreBySlug(storeSlug)
                .then(setStore)
                .catch((err) => console.error("Failed to load store:", err))
                .finally(() => setLoading(false));
        }
    }, [storeSlug, setStoreSlug]);

    if (loading) return <Spinner fullScreen />;

    const freeThreshold = store ? Number(store.free_shipping_threshold) || 0 : 0;
    const shippingFee = store ? Number(store.shipping_fee) || 0 : 0;
    const isFreeShipping = freeThreshold > 0 && subtotal >= freeThreshold;
    const estimatedShipping = isFreeShipping ? 0 : shippingFee;
    const estimatedTotal = subtotal + estimatedShipping;

    return (
        <div
            className="min-h-screen bg-creampink-50/60 text-slate-900 flex flex-col font-sans"
            style={getStoreAccentStyles(store?.accent_color)}
        >
            {store && <StoreNavbar store={store} />}

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex-1">
                {/* Back navigation */}
                <button
                    type="button"
                    onClick={() => navigate(`/store/${storeSlug}`)}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-6 transition cursor-pointer"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Continue Shopping</span>
                </button>

                {/* Page Title */}
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-2xl sm:text-3xl text-slate-900">Shopping Cart</h1>
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                        {cart.length} {cart.length === 1 ? "item" : "items"}
                    </span>
                </div>

                {cart.length === 0 ? (
                    /* Empty Cart State */
                    <div className="bg-white rounded-3xl sm:rounded-4xl border border-slate-200 p-12 sm:p-16 text-center max-w-3xl my-20 mx-auto">
                        <div className="flex items-center justify-center mx-auto mb-6 text-slate-400">
                            <ShoppingBag className="w-12 h-12" />
                        </div>
                        <h2 className="text-xl font-normal text-slate-900 mb-1">Your bag is empty</h2>
                        <p className="text-xs text-slate-500 mb-6 max-w-xs mx-auto leading-relaxed">
                            Explore our catalog to discover handcrafted essentials and unique studio pieces.
                        </p>
                        <Link
                            to={`/store/${storeSlug}/products`}
                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-black text-white text-xs font-medium hover:bg-slate-800 transition"
                        >
                            <span>Explore Catalog</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                ) : (
                    /* Cart Grid Layout */
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Cart Items List */}
                        <div className="lg:col-span-7 space-y-4">
                            <CartShippingProgress freeThreshold={freeThreshold} subtotal={subtotal} />

                            <CartItemList
                                items={cart}
                                storeSlug={storeSlug || ""}
                                onUpdateQuantity={updateQuantity}
                                onRemoveFromCart={removeFromCart}
                            />
                        </div>

                        {/* Summary & Checkout Sidebar */}
                        <div className="lg:col-span-5 sticky top-24">
                            <CartSummarySidebar
                                subtotal={subtotal}
                                shippingFee={shippingFee}
                                isFreeShipping={isFreeShipping}
                                estimatedTotal={estimatedTotal}
                                storeSlug={storeSlug || ""}
                            />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
