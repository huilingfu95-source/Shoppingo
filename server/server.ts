import "dotenv/config";
import express, { Request, Response } from 'express';
import cors from "cors";
import categoryRouter from "./routes/categoryRoutes.js";
import uploadRouter from "./routes/uploadRoutes.js";
import storeRouter from "./routes/storeRoutes.js";
import productRouter from "./routes/productRoutes.js";
import orderRouter from "./routes/orderRoutes.js";
import analyticsRouter from "./routes/analyticsRoutes.js";

const app = express();

// Middleware
app.use(cors())

const port = process.env.PORT || 3000;

app.get('/', (req: Request, res: Response) => {
    res.send('Server is Live!');
});

//API routes
// uploadRouter 放在全局 parser 之前：它自己在 requireAuth 之后解析 body
app.use('/api/upload',uploadRouter)

// 全局 parser 使用 Express 默认大小限制（100kb）
app.use(express.json());
app.use(express.urlencoded());

app.use('/api/categories', categoryRouter);
app.use('/api/stores', storeRouter);
app.use("/api/upload",uploadRouter)
app.use("/api/products",productRouter)
app.use("/api/orders", orderRouter)
app.use("/api/analytics", analyticsRouter)

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

// Express vs Neon Function
// | 项目          | Express（原来）                         | Neon Function：一个云端运行环境（放代码的地方                   |
// |---------------|-----------------------------------------|-------------------------------------------|
// | 入口文件       | server/server.ts                        | server/functions/index.ts                 |
// | 启动 command   | npm run server                          | neon dev                                  |
// | 谁决定 port    | 你在代码里写 app.listen(3000)            | neon.ts 里的 dev.port: 8787               |
// | 谁登记 routes  | app.use("/api/products", ...)           | fetch() 里的 if (path === "/products")    |
// | 连数据库       | Prisma                                  | neon() + sql`...`                         |
// | 部署到哪里     | 要自己找 server（Render、Railway 等）    | neon deploy 直接上传到 Neon               |
// | 测试网址       | http://localhost:3000/api/products      | http://localhost:8787/api/products        |
