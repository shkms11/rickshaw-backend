import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { getAnnouncements } from "./announcement.controller.js";

const router = Router();
router.get("/", authenticate, getAnnouncements);

export default router;
