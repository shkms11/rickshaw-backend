/** Group admin-only dashboard, approval, and search endpoints behind role checks. */
import { Router } from "express";

import {
    decideApproval,
    getDashboardSummary,
    listPendingApprovals,
    searchAdmin,
} from "./admin.controller.js";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate, requireRole("ADMIN", "SUPER_ADMIN"));
router.get("/dashboard-summary", getDashboardSummary);
router.get("/approvals", listPendingApprovals);
router.patch("/approvals/:userId", decideApproval);
router.get("/search", searchAdmin);

/** Router mounted at `/api/admin`; its shared guards apply to every endpoint. */
export default router;
