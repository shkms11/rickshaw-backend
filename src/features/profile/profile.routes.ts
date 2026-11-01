import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { getMyProfile, updateMyProfile } from "./profile.controller.js";

const router = Router();
router.use(authenticate, requireRole("DRIVER", "OWNER", "ADMIN", "SUPER_ADMIN"));
router.get("/", getMyProfile);
router.patch("/", updateMyProfile);

export default router;
