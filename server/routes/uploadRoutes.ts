import express, { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { aiTransform, onModelCatalog, uploadMultiple, uploadSingle } from "../controllers/uploadController.js";

const uploadRouter = Router()

// 只在认证之后、JSON 路由上使用 15MB 的 parser
const largeJson = express.json({ limit: "15mb" })

uploadRouter.post("/single",requireAuth,upload.single("image"),uploadSingle)
uploadRouter.post("/multiple",requireAuth,upload.array("images",5),uploadMultiple)
uploadRouter.post("/ai-on-model",requireAuth,largeJson,onModelCatalog)
uploadRouter.post("/ai-transform",requireAuth,largeJson,aiTransform)

export default uploadRouter