import { Router } from "express";
import {
    createDriver,
    getDrivers,
    getDriverById,
    getMyDriverProfile,
    updateDriverStatus,
} from "./driver.controller.js";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
    listDriverLocations,
    saveMyLocation,
    stopMyLocation,
} from "./location.controller.js";

const router = Router();

router.get("/me", authenticate, requireRole("DRIVER"), getMyDriverProfile);
router.post("/me/location", authenticate, requireRole("DRIVER"), saveMyLocation);
router.delete("/me/location", authenticate, requireRole("DRIVER"), stopMyLocation);
router.get(
    "/locations",
    authenticate,
    requireRole("ADMIN", "SUPER_ADMIN", "OWNER"),
    listDriverLocations,
);
router.post("/", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), createDriver);
router.get("/", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), getDrivers);
router.get("/:id", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), getDriverById);
router.patch("/:id/status", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), updateDriverStatus);

export default router;
