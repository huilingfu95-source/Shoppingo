import { Router } from "express";
import { getMerchantProducts, createProduct, updateProduct, deleteProduct } from "../controllers/productController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const productRouter = Router();

// merchant sees all products of their own store (incl. inactive)
productRouter.get("/merchant", requireAuth, requireRole(["merchant"]), getMerchantProducts);

// merchant can create / update / delete products in their own store
productRouter.post("/", requireAuth, requireRole(["merchant"]), createProduct);
productRouter.put("/:id", requireAuth, requireRole(["merchant"]), updateProduct);
productRouter.delete("/:id", requireAuth, requireRole(["merchant"]), deleteProduct);

export default productRouter;
