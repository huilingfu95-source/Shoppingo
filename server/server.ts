import "dotenv/config";
import express, { Request, Response } from 'express';
import cors from "cors";
import categoryRouter from "./routes/categoryRoutes.js";
import uploadRouter from "./routes/uploadRoutes.js";
import storeRouter from "./routes/storeRoutes.js";

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

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});