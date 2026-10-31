import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
    getOwnerSubscription,
    handleSubscriptionPaymentCancellation,
    handleSubscriptionPaymentFailure,
    handleSubscriptionPaymentIpn,
    handleSubscriptionPaymentSuccess,
    startSubscriptionCheckout,
} from "./subscription.controller.js";

const router = Router();

router.get("/", authenticate, requireRole("OWNER"), getOwnerSubscription);
router.post("/checkout", authenticate, requireRole("OWNER"), startSubscriptionCheckout);
router.post("/sslcommerz/success", handleSubscriptionPaymentSuccess);
router.post("/sslcommerz/ipn", handleSubscriptionPaymentIpn);
router.post("/sslcommerz/fail", handleSubscriptionPaymentFailure);
router.post("/sslcommerz/cancel", handleSubscriptionPaymentCancellation);

export default router;
