/** Group admin-only dashboard, approval, and search endpoints behind role checks. */
import { Router } from "express";

import {
    decideApproval,
    getDashboardSummary,
    listPendingApprovals,
    searchAdmin,
    createScopedAdmin,
    listAssignableOwners,
    updateAdminAssignments,
    listManagedAccounts,
    updateAccountRestriction,
} from "./admin.controller.js";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { listManagedAnnouncements, listNoticeOwners, listNoticeRecipients, publishAnnouncement, removeAnnouncement, updateAnnouncement } from "../announcements/announcement.controller.js";
import { requireScopedAdmin } from "../../middleware/auth.middleware.js";
import { listAdminFleetDrivers, listAdminFleetVehicles } from "./fleet.controller.js";
import { getCongestionReport } from "./congestionReport.controller.js";

const router = Router();

router.use(authenticate, requireRole("ADMIN", "SUPER_ADMIN"));
router.get("/dashboard-summary", getDashboardSummary);
router.get("/fleet/vehicles", listAdminFleetVehicles);
router.get("/fleet/drivers", listAdminFleetDrivers);
router.get("/congestion-report", getCongestionReport);
router.get("/approvals", requireRole("SUPER_ADMIN"), listPendingApprovals);
router.patch("/approvals/:userId", requireRole("SUPER_ADMIN"), decideApproval);
router.get("/owners", requireRole("SUPER_ADMIN"), listAssignableOwners);
router.post("/administrators", requireRole("SUPER_ADMIN"), createScopedAdmin);
router.patch("/administrators/:adminId", requireRole("SUPER_ADMIN"), updateAdminAssignments);
router.get("/managed-accounts", listManagedAccounts);
router.patch("/managed-accounts/:userId/restriction", requireScopedAdmin, updateAccountRestriction);
router.get("/notice-recipients", listNoticeRecipients);
router.get("/notice-owners", listNoticeOwners);
router.get("/announcements", listManagedAnnouncements);
router.post("/announcements", requireScopedAdmin, publishAnnouncement);
router.patch("/announcements/:announcementId", requireScopedAdmin, updateAnnouncement);
router.delete("/announcements/:announcementId", requireScopedAdmin, removeAnnouncement);
router.get("/search", searchAdmin);

/** Router mounted at `/api/admin`; its shared guards apply to every endpoint. */
export default router;
