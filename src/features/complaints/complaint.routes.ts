import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
    createComplaint,
    listAdminComplaints,
    updateComplaintStatus,
} from "./complaint.controller.js";

const router = Router();

router.post("/", authenticate, createComplaint);
router.get("/", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), listAdminComplaints);
router.patch("/:id/status", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), updateComplaintStatus);

export default router;
