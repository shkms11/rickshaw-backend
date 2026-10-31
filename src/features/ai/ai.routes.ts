import { Router } from "express";
import { chat } from "./ai.controller.js";
import { optionalAuthentication } from "./ai.middleware.js";

const router = Router();

router.post("/chat", optionalAuthentication, chat);

export default router;
