import { Router } from "express";

import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { getAdminNoticeBoard, updateAdminNoticeBoard } from "./noticeBoard.controller.js";

const router = Router();

router.use(authenticate, requireRole("DRIVER", "OWNER", "ADMIN", "SUPER_ADMIN"));
router.get("/", getAdminNoticeBoard);
router.put("/", updateAdminNoticeBoard);

export default router;
