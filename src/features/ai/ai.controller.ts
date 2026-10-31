import type { Request, Response } from "express";
import { z } from "zod";
import {
    buildAiContext,
    createLocalReply,
    getGroqReply,
    type AiIdentity,
} from "./ai.service.js";

type AiRequest = Request & { auth?: AiIdentity };

const chatSchema = z.object({
    message: z.string().trim().min(1).max(500),
    language: z.enum(["en", "bn"]).default("en"),
});

export async function chat(req: Request, res: Response) {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Enter a message up to 500 characters" });
    }

    const auth = (req as AiRequest).auth;
    const recognizedRoles = ["ADMIN", "SUPER_ADMIN", "OWNER", "DRIVER"];
    if (auth && !recognizedRoles.includes(auth.role)) {
        return res.status(403).json({ message: "This account role cannot use fleet insights" });
    }

    try {
        const context = auth
            ? await buildAiContext(auth, parsed.data.message)
            : null;
        const groqReply = context?.intent
            ? null
            : await getGroqReply(parsed.data.message, context, parsed.data.language);
        return res.json({
            reply: groqReply ?? createLocalReply(
                parsed.data.message,
                context ?? undefined,
                parsed.data.language,
            ),
            mode: groqReply ? "groq" : "local",
            role: auth?.role ?? "GUEST",
        });
    } catch (error) {
        console.error("AI assistant request error:", error);
        return res.status(500).json({ message: "The assistant could not load role-specific information" });
    }
}
