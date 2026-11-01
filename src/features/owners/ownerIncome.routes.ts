import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { addOwnerRentalIncome, getOwnerRentalIncome } from "./ownerIncome.controller.js";

const router = Router();
router.use(authenticate, requireRole("OWNER"));
router.get("/rental-income", getOwnerRentalIncome);
router.post("/rental-income", addOwnerRentalIncome);

export default router;
