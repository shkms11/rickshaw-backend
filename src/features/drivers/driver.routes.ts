import { Router } from "express";
import {
    createDriver,
    getDrivers,
    getDriverById,
    updateDriverStatus,
} from "./driver.controller.js";

const router = Router();

router.post("/", createDriver);
router.get("/", getDrivers);
router.get("/:id", getDriverById);
router.patch("/:id/status", updateDriverStatus);

export default router;
