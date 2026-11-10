import { Router } from "express";
import {
    createOrder,
    getMerchantOrders,
    updateOrderStatus,
    getOrderReceipt,
    getCustomerOrders,
} from "../controllers/orderController.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

const orderRouter = Router();

// placing an order reserves stock, so cap it per IP to stop fake orders from draining inventory
const checkoutLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: "Too many orders from this IP, please try again later",
});

// checkout: guests allowed; logged-in users get customer_id attached
orderRouter.post("/checkout", checkoutLimiter, optionalAuth, createOrder);

// logged-in user's own orders (any role — merchants can shop too)
orderRouter.get("/customer/my-orders", requireAuth, getCustomerOrders);

// merchant: orders of own store
orderRouter.get("/merchant", requireAuth, requireRole(["merchant"]), getMerchantOrders);
orderRouter.patch("/merchant/:id/status", requireAuth, requireRole(["merchant"]), updateOrderStatus);

// receipt: owner / store merchant / admin, or guest with ?email=
orderRouter.get("/receipt/:orderNumber", optionalAuth, getOrderReceipt);

export default orderRouter;
