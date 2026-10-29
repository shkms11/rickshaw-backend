import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
    assignRickshawDriver,
    createRickshaw,
    listOwnerDrivers,
    listRickshaws,
    updateRickshawStatus,
} from "./rickshaw.controller.js";

const router = Router();
router.use(authenticate);
router.get("/", requireRole("ADMIN", "SUPER_ADMIN", "OWNER"), listRickshaws);
router.get("/drivers", requireRole("OWNER"), listOwnerDrivers);
router.post("/", requireRole("OWNER"), createRickshaw);
router.patch("/:id/driver", requireRole("OWNER"), assignRickshawDriver);
router.patch("/:id/status", requireRole("ADMIN", "SUPER_ADMIN"), updateRickshawStatus);
export default router;
