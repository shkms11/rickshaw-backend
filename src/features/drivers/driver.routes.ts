/** Connect driver self-service and admin endpoints to their controllers and guards. */
import { Router } from "express";
import {
    createDriver,
    getDrivers,
    getDriverById,
    getMyDriverProfile,
    getMyDriverStats,
    addMyDriverActivityEntry,
    updateDriverStatus,
} from "./driver.controller.js";
import { authenticate, requireRole, requireScopedAdmin } from "../../middleware/auth.middleware.js";
import {
    listDriverLocations,
    saveMyLocation,
    stopMyLocation,
} from "./location.controller.js";

const router = Router();

router.get("/me", authenticate, requireRole("DRIVER"), getMyDriverProfile);
router.get("/me/stats", authenticate, requireRole("DRIVER"), getMyDriverStats);
router.post("/me/activity", authenticate, requireRole("DRIVER"), addMyDriverActivityEntry);
router.post("/me/location", authenticate, requireRole("DRIVER"), saveMyLocation);
router.delete("/me/location", authenticate, requireRole("DRIVER"), stopMyLocation);
router.get(
    "/locations",
    authenticate,
    requireRole("ADMIN", "SUPER_ADMIN", "OWNER"),
    listDriverLocations,
);
router.post("/", authenticate, requireRole("SUPER_ADMIN"), createDriver);
router.get("/", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), getDrivers);
router.get("/:id", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), getDriverById);
router.patch("/:id/status", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), requireScopedAdmin, updateDriverStatus);

/** Router mounted at `/api/drivers`. */
export default router;
