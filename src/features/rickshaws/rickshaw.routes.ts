import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { createRickshaw, listRickshaws } from "./rickshaw.controller.js";

const router = Router();
router.use(authenticate);
router.get("/", requireRole("ADMIN", "SUPER_ADMIN", "OWNER"), listRickshaws);
router.post("/", requireRole("OWNER"), createRickshaw);
export default router;
