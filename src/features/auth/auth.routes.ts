/** Public account routes; registration creates pending profiles and login issues tokens. */
import { Router } from "express";
import { register, login } from "./auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);

/** Router mounted by the app at `/api/auth`. */
export default router;
