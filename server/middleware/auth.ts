import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { findNeonUser } from "../services/neonUser.js";
import { prisma } from "../config/prisma.js";

// 用户信息应该是什么格式？
export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: "admin" | "merchant" | "customer";
    storeId?: string | null;
}

// 用户信息应该保存在哪里？→ req.user
//它是在给 Express 原本的 Request 增加一个 user 属性
export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}
//AuthUser defines the shape of req.user: after the middleware looks up the user,
// it stores the result in req.user in this format.
//Backend 使用 jose 库和 Neon Auth 提供的 Public Key（公钥），来验证 Frontend 发送的 JWT
//JWKS（JSON Web Key Set）就是 Neon 公开公钥的地址，
// 也就是你 .env 里的 NEON_AUTH_JWKS_URL，
// JWKS：Backend 从 Neon Auth 获取公钥的机制，用于验证 JWT 签名。

// 去哪里获取 Neon Auth 的公钥？
const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;
const NEON_AUTH_JWKS_URL = process.env.NEON_AUTH_JWKS_URL;

// ④ 准备保存获取 JWKS 公钥的函数
// 用什么工具验证 JWT？→ jose 的 createRemoteJWKSet + jwtVerify，用jwks的public key验证jwt签名
// ReturnType<typeof createRemoteJWKSet> 直接复用这个函数返回值的类型，不用自己手写
let neonJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let neonIssuer = "";
// 第一次用到时才创建，之后复用：jose 内部会缓存公钥，不会每个请求都重新下载

try {
    if (NEON_AUTH_JWKS_URL) {
        neonJWKS = createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));
    }
    if (NEON_AUTH_BASE_URL) {
        neonIssuer = new URL(NEON_AUTH_BASE_URL).origin;
    }
} catch (error) {
    console.warn("Neon auth JWKS initialization error:", error);
}

//verifies authentication token using Neon Auth jwks(jose jwtVerify) and checks if the user exists in the database)
//验证 JWT(from Frontend) → 找到用户 → 找到店铺 → 判断role(admin/merchant/customer) → 返回用户资料。
export const verifyAuthToken = async (token: string): Promise<AuthUser | null> => {
    if (!token || !neonJWKS || !neonIssuer) return null;

    //1. 只把 JWT 验证失败当作"未登录"；数据库错误继续往外抛，由 Express 返回 500
    let payload: JWTPayload;
    try {
        ({ payload } = await jwtVerify(token, neonJWKS, { issuer: neonIssuer, requiredClaims: ["exp", "sub"] }));
    } catch (error) {
        return null;
    }

    const userEmail = String(payload.email || "").toLowerCase();
    const userId = String(payload.sub || "");
    //2. 用户必须存在于 neon_auth.user，身份信息以数据库为准
    const u = await findNeonUser({
        ...(userId ? { id: userId } : {}),
        ...(userEmail ? { email: userEmail } : {}),
    });
    if (!u) return null;

    //3.use prisma to find the store of the user, if the user is a merchant,
    // then the store will be found, otherwise it will be null
    const store = await prisma.stores.findFirst({ where: { merchant_id: u.id } });
    let role: "admin" | "merchant" | "customer" = "customer";

    if (u.role === "admin" || payload.role === "admin") {
        role = "admin";
    } else if (store || u.role === "merchant" || payload.role === "merchant") {
        role = "merchant";
    }

    return {
        id: u.id,
        name: u.name || u.email.split("@")[0],
        email: u.email,
        role,
        storeId: role === "admin" || !store ? null : String(store.id),
    };
};

//why use optional and required at the same time:
//buz not all apis need to be authenticated, 
// some apis can be accessed without authentication, so we need to use optional and required at the same time
//① 定义 Middleware
export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    //② 从 Request 获取 JWT
    const authHeader = req.headers.authorization;

    //"Bearer abc123.jwt"，const token = authHeader.split(" ")[1]; 提取jwt"abc123.jwt"
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ success: false, message: "Unauthorized :No token provided" });
        return;
    }
    // token means jwt token, which is the string after "Bearer "
    const token = authHeader.split(" ")[1];
    //middleware调用verifyAuthToken()，验证token是否有效，并返回用户信息
    const user = await verifyAuthToken(token);

    if (!user) {
        res.status(401).json({ success: false, message: "Unauthorized :Invalid or expired token" });
        return;
    }

    req.user = user;
    next();
};

export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        const user = await verifyAuthToken(token);
        if (user) {
            req.user = user;
        }
    }
    next();

};

//Authorization 
export const requireRole = (roles: Array<"admin" | "merchant" | "customer">) => {
    return (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ): void => {

        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: "Forbidden"
            });
            return;
        }
        next();
    };
};





//           User
//            │
//            │ Email + Password
//            ▼
//         Frontend
//            │
//            ▼
//         Neon Auth
//            │
//            │ 验证登录信息
//            ▼
//       Login Successful
//            │
//            │ issue JWT
//            ▼
//         Frontend
//            │
//            │ API Request + JWT
//            ▼
//          Backend middleware
//            │
//            ├── Header → 确定签名算法
//            │
//            ├── Payload → User ID、Issuer、Expiration
//            │
//            └── Signature → tool jwtverify()+使用jwks的public key verify
//            │
//            ▼
//       JWT Valid ✅
//            │得到userid
//            ▼
//      Neon Database
    //        │
    //        │ Prisma 查询 User
    //        ▼
    //   User Information
    //        │
    //        │ req.user = user
    //        ▼
    //    next()
    //        │
    //        ▼
    //   Route Handler
    //        │
    //        │ req.user.id
    //        ▼
    //  查询用户的订单
//json webset token and jason website key set
// Backend 收到 JWT
//        ↓
// 调用 getNeonJWKS()
//        ↓
// 获得 JWKS 工具
//        ↓
// 调用 jwtVerify()
//        ↓
// 使用 JWKS 中的 Public Key
//        ↓
// 验证 JWT Signature
//        ↓
// 验证成功 ✅
//        ↓
// 返回 Payload（包含用户 ID 等）