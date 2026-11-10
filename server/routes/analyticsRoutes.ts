import { Router } from "express";
import { getMerchantAnalytics, getPlatformAnalytics } from "../controllers/analyticsController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const analyticsRouter = Router();

// merchant: dashboard stats for own store
analyticsRouter.get("/merchant", requireAuth, requireRole(["merchant"]), getMerchantAnalytics);

// admin: platform-wide stats
analyticsRouter.get("/platform", requireAuth, requireRole(["admin"]), getPlatformAnalytics);

export default analyticsRouter;
