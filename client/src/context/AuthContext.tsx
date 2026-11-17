import React, { createContext, useContext, useState, useEffect } from "react";
import { authClient } from "../auth";
import { api } from "../config/api";

// api.ts 的 interceptor 也读这个 key，两边必须一致
const TOKEN_KEY = "shoppingo_token";

export interface User {
    id: number | string;
    name: string;
    email: string;
    role: "admin" | "merchant" | "customer" | string;
    store_id?: number | string | null;
}

export interface Store {
    id: number | string;
    merchant_id: string | number;
    name: string;
    slug: string;
    logo_url?: string;
    banner_url?: string;
    description?: string;
    currency: string;
    status: "active" | "suspended";
    shipping_fee: number;
    free_shipping_threshold: number;
    hero_style?: "hero1" | "hero2" | "hero3" | "hero4" | string;
    accent_color?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    store: Store | null;
    loading: boolean;
    login: (token: string, user: User, store?: Store | null) => void;
    logout: () => Promise<void>;
    refreshMe: () => Promise<void>;
    setStore: (store: Store | null) => void;
}

// ① 创建 context（一个空的"共享盒子"）
const AuthContext = createContext<AuthContextType | undefined>(undefined);


// ② AuthProvider：往盒子里装东西的 component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
    const [store, setStore] = useState<Store | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    // 把前端的登录状态全部清空（state + localStorage）
    const clearAuthState = () => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setStore(null);
        setToken(null);
    };

    // refreshMe() 负责去问 Neon，然后把答案（user、role、store、JWT）存进前端 state。
    // 打开 / 刷新页面时：问 Neon Auth "现在谁登录着"，恢复登录状态
//     刷新页面
//     ↓
    // state 消失（user = null）
    // ↓
    // 但 Neon 的 session 还在
    // ↓
    // refreshMe() → getSession() 再拿一次 → 放回 state
    // ↓
    // 又是登录状态了

    const refreshMe = async () => {
        try {
            // 1. 向 Neon Auth 查询当前 session；session.token 就是 Neon 签的 JWT
            const sessionRes = await authClient.getSession().catch(() => null);
            const neonSession = sessionRes?.data?.session;
            const neonUser = sessionRes?.data?.user;

            // 2. 没有登录过 → 清空，结束（finally 会把 loading 设为 false）
            if (!neonUser || !neonSession?.token) {
                clearAuthState();
                return;
            }

            // 3. 保存 JWT：api.ts 的 interceptor 会从 localStorage 读它并放进 Authorization header
            const jwt = neonSession.token;
            localStorage.setItem(TOKEN_KEY, jwt);
            setToken(jwt);

            // 4. 先根据 Neon user 上的 role 判断身份，默认 customer
            //    （Neon 的 user 类型里没有声明 role 字段，所以用 as 读取）
            const neonRole = (neonUser as { role?: string }).role;
            let role: User["role"] = neonRole === "admin" || neonRole === "merchant" ? neonRole : "customer";

            // 5. 不是 admin 的话，问 Express 这个用户有没有店铺；有店铺就是 merchant
            let resolvedStore: Store | null = null;
            if (role !== "admin") {
                try {
                    const storeRes = await api.get("/api/stores/me");
                    if (storeRes.data?.success && storeRes.data?.store) {
                        resolvedStore = storeRes.data.store;
                        role = "merchant";
                    }
                } catch {
                    // 没有店铺（例如 404）或请求失败：当作没有店铺
                    resolvedStore = null;
                }
            }

            // 6. 组装成 app 自己的 User 格式，放进 context
            setUser({
                id: neonUser.id,
                name: neonUser.name || neonUser.email.split("@")[0],
                email: neonUser.email,
                role,
                store_id: resolvedStore?.id ?? null,
            });
            setStore(resolvedStore);
        } catch (err) {
            console.error("Error refreshing auth session:", err);
            clearAuthState();
        } finally {
            setLoading(false);
        }
    };

    // app 第一次加载时执行一次
    useEffect(() => {
        refreshMe();
    }, []);

    // 登录成功后（AuthCard 调用）：把 JWT 和用户信息放进 context
    const login = (newToken: string, newUser: User, newStore?: Store | null) => {
        // ① 保存 Token 到 localStorage 和 State
        if(newToken){
            localStorage.setItem(TOKEN_KEY,newToken)//(name,value)
            setToken(newToken);

        }
        // ② 把 User 放进 State
        setUser(newUser);
        // ③ 把 Store 放进 State（如果提供了）
        if (newStore !== undefined) {
            setStore(newStore);
        }
    };

    // 登出：先让 Neon Auth 结束 session，再清空前端状态
    const logout = async () => {
        try {
            await authClient.signOut();//signout： Neon 删掉你的 session（服务器忘记你）
        } catch (err) {
            // signOut 失败（比如断网）也只打 log，不阻止前端登出
            console.error("Error signing out:", err);
        } finally {
            // 不管 Neon signOut 成功与否，清空 user、store、token（页面忘记你）
            clearAuthState();
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, store, loading, login, logout, refreshMe, setStore }}>{children}</AuthContext.Provider>
    );
};
// ③ useAuth：从盒子里拿东西的 hook
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};

// 获取信息：从 Neon Auth 获取用户，从 Express 获取店铺。
// 保存信息：使用 React useState 保存登录状态。
// 共享信息：使用 AuthContext.Provider 把状态和函数提供给其他 Components。



// 现在 AuthProvider 做了两件事：
// 1. 用 useState 保存数据。
// 2. 用 AuthContext.Provider 把数据提供给子组件。
// 所以，AuthProvider + useState 不是一个特殊的 React 功能组合。它只是说：我们创建了一个叫 AuthProvider 的组件，并在里面使用 useState 管理数据。


// 3. 为什么要把 Function 放在 AuthProvider 里面？
// 因为这些函数需要操作它里面的 State。

//         Neon auth（session）     Express（store）
//           ▲     │                │
//  signIn / │     │ getSession     │ /api/stores/me
//  signOut  │     ▼                ▼
//           │   ┌──── refreshMe() ────┐
//           │   │  判断 role，组装 User  │：组装user，是因为user格式是neon auth规定的，要转换成app(frontend)user格式
//           │   └──────────┬─────────┘
//           │              │ setUser / setStore / setToken
//           │              ▼
//        login /     AuthContext（state，RAM）
//        logout            │ useAuth()
//                          ▼
//                 Navbar / Dashboard / ...
// //signIn 需要 email 和 password，只在登录那一刻用一次
// 之后不可能每次都让用户重新输密码，所以用 cookie 当"房卡"
// getSession 只要 cookie，随时可以问，刷新多少次都行
//	Neon Auth（服务器）	浏览器
//               Neon Auth                                          browser
// signIn 时	验证密码，创建 session（在 neon_auth.session 插入一行），｜收到 Set-Cookie，保存 cookie
//              发 Set-Cookie(相当于房卡)
// 之后每次请求	  用 cookie 去 session 表查是谁	                       ｜自动带上 cookie
// logout 时	删除 session 那一行	                                 ｜删掉 cookie



//cookie：

// 第一次：      输 email + 密码 → signIn → Neon 给你 cookie
// 之后刷新页面：  不用再 signIn，浏览器自动带上 cookie → Neon 认出你
// 有了 cookie，就不用每次都 signIn。 这也是为什么 refreshMe 里只有 getSession()，没有 signIn()。它不需要密码，靠 cookie 就够了。

// 只有 cookie 没了（过期、logout、清浏览器数据），才需要再走一次 AuthCard 的 signIn。