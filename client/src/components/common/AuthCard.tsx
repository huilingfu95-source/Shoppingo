import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../../auth";
import { api } from "../../config/api";
import { useAuth, type User as AuthUserType, type Store } from "../../context/AuthContext";
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, ArrowLeftIcon } from "lucide-react";
import toast from "react-hot-toast";

export interface AuthSuccessData {
    token: string;
    user: AuthUserType;
    store?: any;
    mode: "login" | "register";
}

export interface AuthCardProps {
    role?: "admin" | "merchant" | "customer";
    initialMode?: "login" | "register";
    allowRegister?: boolean;
    storeId?: number | string;
    storeSlug?: string;
    onSuccess?: (data: AuthSuccessData) => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({ role, initialMode = "login", allowRegister = true, storeId, storeSlug, onSuccess }) => {
    const [mode, setMode] = useState<"login" | "register">(allowRegister ? initialMode : "login");
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const isRegister = allowRegister && mode === "register";
    const effectiveRole = role || (storeSlug || storeId ? "customer" : "merchant");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const email = form.email.trim().toLowerCase();
        const name = form.name.trim() || email.split("@")[0];

        try {
            // 1. 让 Neon Auth 验证身份：注册 → signUp，登录 → signIn（这一步才真正检查密码）
            const result = isRegister
                ? await authClient.signUp.email({ email, password: form.password, name })
                : await authClient.signIn.email({ email, password: form.password });

            if (result.error) {
                // 比如密码错误、email 已被注册
                toast.error(result.error.message || "Authentication failed");
                return;
            }

            // 2. 登录成功后，从 Neon 取 session：里面有 JWT token 和用户信息
            const sessionRes = await authClient.getSession();
            const neonSession = sessionRes?.data?.session;
            const neonUser = sessionRes?.data?.user;

            if (!neonUser || !neonSession?.token) {
                toast.error("Could not start a session. Please try again.");
                return;
            }
            const token = neonSession.token;

            // 3. 判断 role：以 Neon user 上的 role 为准，默认 customer
            const neonRole = (neonUser as { role?: string }).role;
            let userRole: AuthUserType["role"] = neonRole === "admin" || neonRole === "merchant" ? neonRole : "customer";

            // 4. 管理员登录页：不是 admin 就拒绝，并登出刚建立的 session
            if (effectiveRole === "admin" && userRole !== "admin") {
                await authClient.signOut().catch(() => null);
                toast.error("Access denied: You do not have platform admin privileges");
                return;
            }

            const baseUser: AuthUserType = {
                id: neonUser.id,
                name: neonUser.name || name,
                email: neonUser.email,
                role: userRole,
                store_id: null,
            };

            // 5. 不是 admin 的话，问 Express 这个用户有没有店铺；有店铺就是 merchant
            //    这时还没调用 login()，localStorage 里没有新 token，所以手动把 token 放进 header
            let userStore: Store | null = null;
            if (userRole !== "admin") {
                try {
                    const storeRes = await api.get("/api/stores/me", {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (storeRes.data?.success && storeRes.data?.store) {
                        userStore = storeRes.data.store;
                        userRole = "merchant";
                    }
                } catch {
                    // 没有店铺（例如 404）：当作普通用户
                    userStore = null;
                }
            }

            const authUser: AuthUserType = { ...baseUser, role: userRole, store_id: userStore?.id ?? null };

            toast.success(isRegister ? "Account created successfully!" : "Signed in successfully!");

            if (onSuccess) {
                onSuccess({ token, user: authUser, store: userStore, mode });
                return;
            }

            // 6. 只在这里调用一次 login()：把完整的 user + store 放进 AuthContext，然后按身份跳转
            login(token, authUser, userStore);
            if (authUser.role === "admin") {
                navigate("/admin");
            } else if (authUser.role === "merchant" || effectiveRole === "merchant") {
                navigate(userStore ? "/merchant" : "/merchant/store-setup");
            } else if (storeSlug) {
                navigate(`/store/${storeSlug}`);
            } else {
                navigate("/");
            }
        } catch (err) {
            console.error("Auth error:", err);
            toast.error("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const inputClasses =
        "w-full pl-10 pr-4 py-2.5 text-xs bg-creampink-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-[var(--store-accent)] focus:ring-1 focus:ring-[var(--store-accent-ring)] transition text-slate-900 placeholder-slate-400";

    return (
        <div className="w-full max-w-sm bg-white rounded-4xl border border-slate-200/90 p-8 sm:p-9 shadow-xs">
            <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => navigate(-1)}>
                <ArrowLeftIcon className="size-5 text-slate-600" />
                <p className="text-xs text-slate-600 hover:text-slate-900">Go Back</p>
            </div>

            <div className="text-center mb-6">
                <h1 className="text-xl sm:text-2xl tracking-tight text-slate-900">{isRegister ? "Create Account" : "Welcome Back"}</h1>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {isRegister ? "Create an account to get started." : "Enter your credentials to access your account."}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {isRegister && (
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Name</label>
                        <div className="relative">
                            <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                required
                                placeholder="Alex Morgan"
                                value={form.name}
                                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                className={inputClasses}
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        {effectiveRole === "admin" ? "Admin Email" : "Email Address"}
                    </label>
                    <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="email"
                            required
                            placeholder={effectiveRole === "admin" ? "admin@example.com" : "you@example.com"}
                            value={form.email}
                            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                            className={inputClasses}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Password</label>
                    <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type={showPassword ? "text" : "password"}
                            required
                            placeholder="••••••••"
                            value={form.password}
                            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                            className={`${inputClasses} pr-10 font-mono`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-5 text-white text-xs font-semibold rounded-full transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-xs active:scale-[0.98] store-accent-btn"
                >
                    <span>{loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <div className="mt-2">
                    {!allowRegister ? null : isRegister ? (
                        <p className="text-xs text-slate-500 text-center">
                            Already have an account?{" "}
                            <span onClick={() => setMode("login")} className="font-semibold cursor-pointer store-accent-text">
                                Sign In
                            </span>
                        </p>
                    ) : (
                        <p className="text-xs text-slate-500 text-center">
                            Don't have an account?{" "}
                            <span onClick={() => setMode("register")} className="font-semibold cursor-pointer store-accent-text">
                                Create Account
                            </span>
                        </p>
                    )}
                </div>
            </form>
        </div>
    );
};




// ① 页面打开
//    → 执行 return，屏幕上显示登录表单（JSX）
//    → handleSubmit 这时还没运行，只是"准备好了"

// ② 用户填 email + 密码

// ③ 用户点 Sign In
//    → 这时才执行 handleSubmit：
//       问 Neon 密码对不对 → 判断身份 → 查店铺 → login() → 跳转到对应的 url


 
// CustomerAuth / MerchantLogin / AdminLogin   ← 三个门（页面）
//             │  都用
//             ▼
//         AuthCard                            ← 安检口：查证件、看身份
//             │  验证完调用 login()
//             ▼
//        AuthContext                          ← 记住"现在是谁"，全 app 共享
//             │  token 存进 localStorage
//             ▼
//          api.ts                             ← 以后每个请求自动带上 token
// 在 Alice 花店逛  /store/alice-flowers
//         ↓ 点"登录"
// CustomerAuth    /store/alice-flowers/login     ← 登录页（出发点）
//         ↓ 填表，点 Sign In，AuthCard 处理
// 跳回花店首页     /store/alice-flowers            ← 跳转的目的地（Storefront 页面）


// ┌─────────────────────────────┐
// │    AuthCard → Neon Auth     │
// │    执行登录并验证身份         │
// └─────────────────────────────┘
//               ↓通过login
// ┌─────────────────────────────┐
// │        AuthProvider         │
// │ 保存 User、Token、Store      │
// │        到 React State       │
// └─────────────────────────────┘
//               ↓
// ┌─────────────────────────────┐
// │    AuthContext.Provider     │
// │    通过 value 共享数据       │
// └─────────────────────────────┘
//               ↓
//        ┌──────────────┐
//        │              │
//        ↓              ↓
// ┌────────────┐  ┌────────────┐
// │   Navbar   │  │ Dashboard  │
// │ useAuth()  │  │ useAuth()  │
// └────────────┘  └────────────┘



// // 任何页面打开
//    ↓
// ① AuthProvider（永远都在，最先出现）
//    ↓
// ② 这个页面需要登录吗？
//    ├─ 不需要（逛店、看商品）→ 直接显示页面，AuthCard 不出现
//    └─ 需要（商家后台）→ 已经登录了吗？
//           ├─ 登录了 → 直接显示页面
//           └─ 没登录 → 送去登录页，这时 AuthCard 才出现
