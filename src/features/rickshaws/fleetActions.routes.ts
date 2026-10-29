import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
    createLostRickshawAlert,
    createRickshawRemovalRequest,
    listFleetActions,
    reviewFleetAction,
} from "./fleetActions.controller.js";

const router = Router();

router.use(authenticate);
router.get("/", requireRole("OWNER", "DRIVER", "ADMIN", "SUPER_ADMIN"), listFleetActions);
router.post("/lost", requireRole("OWNER", "DRIVER"), createLostRickshawAlert);
router.post("/removal-request", requireRole("OWNER"), createRickshawRemovalRequest);
router.patch("/:id", requireRole("ADMIN", "SUPER_ADMIN"), reviewFleetAction);

export default router;
