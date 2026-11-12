# Neon Auth vs. Building Auth Yourself

Neon Auth (managed Better Auth) handles user accounts for you and stores
them in your own Neon database, in the `neon_auth` schema.


## What Neon Auth does for you

| Feature                       | With Neon Auth                   | Without Neon Auth (DIY)                |
|-------------------------------|----------------------------------|----------------------------------------|
| User table                    | Created for you (neon_auth.user) | Design in schema.prisma, run migration |
| Sign up                       | Built in (frontend SDK)          | Write a POST /signup endpoint          |
| Log in                        | Built in (frontend SDK)          | Write a POST /login endpoint           |
| Log out                       | Built in                         | Invalidate tokens/sessions yourself    |
| Password hashing              | Built in                         | Hash and compare with bcrypt           |
| Stay logged in                | Built in (sessions/tokens)       | Issue JWTs/sessions, handle expiry     |
| Password reset / email verify | Built in                         | Build it, plus set up an email service |
| Google / GitHub login         | Turn on in the Neon console      | Integrate OAuth yourself               |
| Security (e.g. brute force)   | Handled for you                  | Handle it yourself                     |
| Login / signup pages          | Prebuilt components, or custom   | Build them yourself                    |


## What you build either way

1. Check who sent each request
   Verify the login token the frontend sends with each request.

2. Look up user info
   With Neon Auth:     findNeonUser() reads from neon_auth.user
   Without Neon Auth:  prisma.users.findUnique(...)

3. Shoppingo's own features
   Stores, products, categories and orders.


## Bottom line

With Neon Auth:     Sign up, log in, password storage and sessions are
                    handled for you. You only read user info on the
                    backend and focus on Shoppingo's features.

Without Neon Auth:  You build the whole user system from scratch. It's
                    more work and easier to get security wrong, but you
                    learn how authentication works under the hood.

你的 Neon 数据库（PostgreSQL）
│
├── public（schema）        ← 你的表，你用 Prisma 管
│   ├── stores
│   ├── products
│   ├── categories
│   └── orders
│
└── neon_auth（schema）     ← Neon Auth 的表，它自动管
    ├── user        用户信息
    ├── account     加密后的密码
    ├── session     登录状态
    └── verification 验证码


Prisma Schema：定义数据库应该长什么样。
Prisma Migration：把 Schema 的变化应用到数据库。
Prisma Client：让你的代码能够操作数据库。
//fastapi里router：@router.get("/categories")和controller：async def get_categories():是写在一起的
@router.get("/categories")
async def get_categories():
    categories = await get_categories_from_db()
    return {"categories": categories}


`server/` 是 **Shoppingo 这个多商家电商平台的 backend**。它负责三件事：**存取数据、检查身份、处理图片**。

## 整体结构
```
server/
├── server.ts          ← ① Express 主入口（npm run server，port 3000）
├── routes/            ← ② 路径 → 交给哪个 controller
├── middleware/        ← ③ 进 controller 之前的检查（登入、角色、限流、上传）
├── controllers/       ← ④ 真正的业务逻辑
├── services/          ← ⑤ 可重用的数据库操作（Neon Auth 的用户表）
├── config/            ← ⑥ 外部服务的连接设定（Prisma、Cloudinary）
├── prisma/            ← ⑦ 数据库结构（schema + migrations）
├── functions/         ← ⑧ Neon Function：公开只读 API（neon dev，port 8787）
└── neon.ts            ← ⑧ 的设定文件
```

## 一个 request 怎么走（Express）
```
前端 → server.ts → routes → middleware → controller → Prisma → Neon Postgres
                                                   ↘ Cloudinary（图片）
```
以"商家新增商品"为例：
```
POST /api/products
  → productRoutes.ts        找到对应的 route
  → requireAuth             验证 JWT（jose + Neon Auth 公钥）
  → requireRole(merchant)   检查是不是商家
  → createProduct           检查字段 → 找到商家的店 → prisma 写入
  → res.json(...)
```

## 每个部分做什么
### ③ middleware
| 文件 | 作用 |
|---|---|
| `auth.ts` | `requireAuth`：必须登入；`optionalAuth`：可登入可不登入；`requireRole`：检查 admin / merchant / customer |
| `rateLimit.ts` | 限制同一个 IP 的请求次数（用在 checkout） |
| `upload.ts` | multer，接收上传的图片文件 |

### ④ controllers（按用户角色分）
| 模块 | 谁用 | 功能 |
|---|---|---|
| **store** | 商家 / admin / 所有人 | 开店（onboard）、改店铺设定；admin 查所有店、停用店铺；所有人用 slug 看店 |
| **product** | 商家 | 新增、修改、删除自己店里的商品 |
| **category** | 商家 / 所有人 | 新增、删除分类；所有人可看分类 |
| **order** | 顾客 / 商家 / 访客 | 结账（不登入也可以）、看我的订单、商家看订单并改状态、看收据 |
| **upload** | 登入用户 | 上传单张或多张图片到 Cloudinary，还有 AI 换模特图、AI 改图 |
| **analytics** | 商家 / admin | 商家看自己店的数据，admin 看全平台数据 |

### ⑤ services/neonUser.ts
用户登入是 **Neon Auth** 管的，用户资料在 `neon_auth.user` 表里，不在 Prisma schema 里。所以这里用 raw SQL 去查用户、改角色、列出商家。

### ⑦ 数据库（prisma/schema.prisma）
4 个主要的表：`stores`、`products`、`categories`、`orders`，再加上 Neon Auth 自己管的 `neon_auth.user`。

### ⑧ functions/index.ts（Neon Function）
这是**另一套独立的 API**，只做公开、只读的查询，不用登入：
- `/health`：检查 API 有没有在跑
- `/stores/featured`：首页推荐的店
- `/stores/slug/:slug`：某一家店的资料
- `/products`：某家店的商品列表，可以筛选和搜索
- `/products/:id`：商品详情

它不用 Express 和 Prisma，直接写 `fetch()` + `sql\`...\``。



## 一句话总结
|      | Express（server.ts）       | Neon Function（functions/index.ts） |
|---|---|---|
| 负责 | 所有要登入、会写入的功能       | 公开浏览商店和商品 |
| 框架 | Express + Prisma           | 没用框架，直接写 `fetch()` + `sql` |
| 启动 | `npm run server` → `:3000` | `neon dev` → `:8787` |
| 数据库 | 同一个 Neon Postgres       | 同一个 Neon Postgres |

**用户与权限**交给 Neon Auth，**数据**存在 Neon Postgres，**图片**放在 Cloudinary。
