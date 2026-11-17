import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../../config/api";
import { useAuth, type Store } from "../../context/AuthContext";
import { StoreNavbar } from "../../components/StoreNavbar";
import { AuthCard } from "../../components/common/AuthCard";
import { getStoreAccentStyles } from "../../utils/storeAccent";


//CustomerAuth = AuthCard + 店铺的 Navbar + 店铺的颜色。
//CustomerAuth 就是把通用的 AuthCard 变成"这家店的版本"
export const CustomerAuth: React.FC = () => {
    const { storeSlug } = useParams<{ storeSlug: string }>();
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [store, setStore] = useState<Store | null>(null);
    const [notFound, setNotFound] = useState(false);

    // 根据网址里的 storeSlug，从后端拿真实店铺（GET /api/stores/:slug）
    useEffect(() => {
        if (!storeSlug) return;

        let cancelled = false; // 防止切换店铺时，旧请求晚回来覆盖新店铺
        setNotFound(false);

        api.get(`/api/stores/${encodeURIComponent(storeSlug)}`)
            .then((res) => {
                if (cancelled) return;
                if (res.data?.success && res.data?.store) {
                    setStore(res.data.store);
                } else {
                    setNotFound(true);
                }
            })
            .catch(() => {
                // 404：店铺不存在或已被停用
                if (!cancelled) setNotFound(true);
            });

        return () => {
            cancelled = true;
        };
    }, [storeSlug]);

    // If customer is already authenticated, redirect to store homepage
    useEffect(() => {
        if (!authLoading && user && storeSlug) {
            navigate(`/store/${storeSlug}`, { replace: true });
        }
    }, [user, authLoading, storeSlug, navigate]);

    // 店铺不存在：显示提示，而不是显示一个假店铺的登录页
    if (notFound) {
        return (
            <div className="min-h-screen bg-creampink-50/60 text-slate-900 flex flex-col items-center justify-center gap-3 px-4 font-sans">
                <h1 className="text-xl tracking-tight">Store not found</h1>
                <p className="text-xs text-slate-500">This store doesn't exist or is no longer available.</p>
                <Link to="/" className="text-xs font-semibold text-slate-700 hover:text-slate-900">
                    Back to Shoppingo
                </Link>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-creampink-50/60 text-slate-900 flex flex-col font-sans"
            style={getStoreAccentStyles(store?.accent_color)}
        >
            {/* StoreNavbar 的 id 类型是 number，而 Store.id 是 number | string，所以转一下 */}
            {store && <StoreNavbar store={{ ...store, id: Number(store.id) }} />}

            <main className="max-w-md mx-auto px-4 py-12 sm:py-16 w-full flex-1 flex flex-col justify-center items-center">
                <AuthCard role="customer" allowRegister={true} storeId={store?.id} storeSlug={storeSlug} />
            </main>
        </div>
    );
};

// ① 顾客打开 /store/alice-flowers/login
//    → CustomerAuth 的 useEffect 运行
//    → fetch /api/stores/alice-flowers        ← 你选中的这段，拿店铺
//    → 页面显示 Alice 花店的 Navbar 和颜色

// ② 顾客填 email、password（这段时间不发任何请求）

// ③ 顾客点 Sign In
//    → AuthCard 的 handleSubmit 运行
//    → 问 Neon 密码对不对
//    → fetch /api/stores/me                   ← 另一个请求，查"这个人自己有没有开店"
//    → 跳回店铺首页
//总关系
// 点 Sign In 之后，AuthCard 做：

// ① 问 Neon：密码对不对？        ← 你漏了这步，这是最重要的
// ② 看这个人的身份（role）
// ③ 查这个人有没有自己的 store    ← 你说的"有没有 store"
// ④ 调用 login()，把 token、user、store 交出去
// ⑤ 跳转页面

//           ↓ login() 把数据交给

// AuthProvider（在 AuthContext.tsx 里）
// 用 useState 存起来               ← 你说的"用 provider 存这些数据"
// 整个 app 都能通过 useAuth() 拿到

// ① CustomerAuth   打开登录页 → 去后端拿这家店的信息 → 套上店铺的 Navbar 和颜色
//         ↓ 页面里放着
// ② AuthCard       显示表单 → 用户点 Sign In → 问 Neon 密码 → 查 store
//         ↓ 调用 login()
// ③ AuthContext    把 token、user、store 存起来
//         ↓
// ④ 跳回店铺首页
