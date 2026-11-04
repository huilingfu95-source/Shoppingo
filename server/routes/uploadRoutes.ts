import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { aiTransform, onModelCatalog, uploadMultiple, uploadSingle } from "../controllers/uploadController.js";

const uploadRouter = Router()

uploadRouter.post("/single",requireAuth,upload.single("images"),uploadMultiple)
uploadRouter.post("/multiple",requireAuth,upload.array("image,5"),uploadSingle)
uploadRouter.post("/ai-on-model",requireAuth,onModelCatalog)
uploadRouter.post("ai-transform",requireAuth,aiTransform)

export default uploadRouter