import { Router } from "express";

import { searchAdmin } from "./admin.controller.js";

const router = Router();

router.get("/search", searchAdmin);

export default router;
