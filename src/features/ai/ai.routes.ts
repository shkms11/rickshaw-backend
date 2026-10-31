/** Expose chat with optional authentication so public and signed-in use share a route. */
import { Router } from "express";
import { chat } from "./ai.controller.js";
import { optionalAuthentication } from "./ai.middleware.js";

const router = Router();

router.post("/chat", optionalAuthentication, chat);

/** Router mounted at `/api/ai`. */
export default router;
