import { Router } from "express";
import {
    onboardMerchant,
    createStore,
    getMyStore,
    updateStoreSettings,
    getAllStores,
    getAllMerchants,
    toggleStoreStatus,
    getStoreBySlug,
} from "../controllers/storeController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const storeRouter = Router();

// logged-in user: become a merchant / create a store
// createStore 不加 requireRole：customer 建完 store 会自动升成 merchant
storeRouter.post("/onboard", requireAuth, onboardMerchant);
storeRouter.post("/", requireAuth, createStore);

// merchant: own store (dashboard)
storeRouter.get("/me", requireAuth, getMyStore);
storeRouter.put("/me", requireAuth, requireRole(["merchant"]), updateStoreSettings);

// admin
storeRouter.get("/admin/all", requireAuth, requireRole(["admin"]), getAllStores);
storeRouter.get("/admin/merchants", requireAuth, requireRole(["admin"]), getAllMerchants);
storeRouter.patch("/admin/:id/status", requireAuth, requireRole(["admin"]), toggleStoreStatus);

// public storefront — 必须放在最后，否则 /me、/admin/... 会被当成 slug
storeRouter.get("/:slug", getStoreBySlug);

export default storeRouter;
