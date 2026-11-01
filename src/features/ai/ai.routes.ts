/** Expose chat with optional authentication so public and signed-in use share a route. */
import { Router } from "express";
import { chat } from "./ai.controller.js";
import { optionalAuthentication } from "./ai.middleware.js";
import { authenticate, requireRole, requireScopedAdmin } from "../../middleware/auth.middleware.js";
import { confirmAction, undoAction } from "./ai.controller.js";

const router = Router();

router.post("/chat", optionalAuthentication, chat);
router.post(
    "/actions/confirm",
    authenticate,
    requireRole("ADMIN", "SUPER_ADMIN"),
    requireScopedAdmin,
    confirmAction,
);
router.post(
    "/actions/:actionId/undo",
    authenticate,
    requireRole("ADMIN", "SUPER_ADMIN"),
    requireScopedAdmin,
    undoAction,
);

/** Router mounted at `/api/ai`. */
export default router;
