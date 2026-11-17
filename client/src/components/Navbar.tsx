import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ShoppingBag, LogOut, LayoutDashboard, Plus } from "lucide-react";

export const Navbar: React.FC = () => {
    const { user, store, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        if (user?.role === "customer") {
            navigate("/");
        } else if (user?.role === "admin") {
            navigate("/admin/login");
        } else {
            navigate("/merchant/login");
        }
    };

    return (
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 font-sans">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2 text-slate-900 hover:opacity-80 transition">
                    <img src="/logo.svg" alt="logo" className="size-7" />
                    <span className="font-semibold tracking-tight text-xl">Shoppingo</span>
                </Link>

                <nav className="flex items-center gap-2">
                    {user ? (
                        <>
                            {user.role === "admin" && (
                                <Link
                                    to="/admin"
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-zhuyue-800 bg-creampink-50 hover:bg-creampink-100 border border-creampink-200/80 rounded-lg transition"
                                >
                                    Platform Admin
                                </Link>
                            )}

                            {user.role === "merchant" &&
                                (store ? (
                                    <>
                                        <Link
                                            to={`/store/${store.slug}`}
                                            target="_blank"
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zhuyue-700 hover:bg-creampink-50 rounded-lg transition"
                                            title="View Live Store"
                                        >
                                            <ShoppingBag className="w-3.5 h-3.5 text-zhuyue-600" /> Live Store
                                        </Link>
                                        <Link
                                            to="/merchant"
                                            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                                        >
                                            <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
                                        </Link>
                                    </>
                                ) : (
                                    <Link
                                        to="/merchant/store-setup"
                                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zhuyue-600 hover:bg-zhuyue-700 rounded-lg transition"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Create Store
                                    </Link>
                                ))}

                            {user.role === "customer" && (
                                <>
                                    {store && (
                                        <Link
                                            to={`/store/${store.slug}/orders`}
                                            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition"
                                        >
                                            My Orders
                                        </Link>
                                    )}
                                    <Link
                                        to={store ? "/merchant" : "/merchant/store-setup"}
                                        className="text-xs font-semibold text-white bg-zhuyue-600 hover:bg-zhuyue-700 px-4 py-2 rounded-lg transition"
                                    >
                                        Start a store
                                    </Link>
                                </>
                            )}

                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-900 px-3 py-1.5 rounded-lg transition cursor-pointer"
                            >
                                <LogOut className="w-3.5 h-3.5" /> Exit
                            </button>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Link
                                to="/merchant/login"
                                className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3.5 py-2 rounded-lg hover:bg-creampink-50 transition"
                            >
                                Sign in
                            </Link>
                            <Link
                                to="/merchant/register"
                                className="text-xs font-semibold text-white bg-zhuyue-600 hover:bg-zhuyue-700 px-4 py-2 rounded-lg transition"
                            >
                                Start a store
                            </Link>
                        </div>
                    )}
                </nav>
            </div>
        </header>
    );
};
