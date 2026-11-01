/** Validate chat input and coordinate role-scoped context with local or Groq replies. */
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
    buildAiContext,
    createLocalReply,
    getGroqReply,
    parseAiProposedAction,
    type AiIdentity,
} from "./ai.service.js";
import { isBanglaInput, isCapabilitiesQuestion } from "./ai.language.service.js";
import {
    AiActionError,
    executeAiAction,
    findConfirmedAiAction,
    undoAiAction,
} from "./ai.action.service.js";

type AiRequest = Request & { auth?: AiIdentity };

const chatSchema = z.object({
    message: z.string().trim().min(1).max(500),
    language: z.enum(["en", "bn"]).default("en"),
});
const confirmActionSchema = z.object({ proposalToken: z.string().min(1).max(5000) });
const proposalClaimsSchema = z.object({
    purpose: z.literal("ai-action-proposal"),
    userId: z.string().min(1),
    role: z.enum(["ADMIN", "SUPER_ADMIN"]),
    proposalId: z.string().uuid(),
    action: z.unknown(),
});

/** Use private database context only for a verified, supported signed-in role. */
export async function chat(req: Request, res: Response) {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Enter a message up to 500 characters" });
    }

    const auth = (req as AiRequest).auth;
    const language = isBanglaInput(parsed.data.message) ? "bn" : parsed.data.language;
    const capabilityQuestion = isCapabilitiesQuestion(parsed.data.message);
    const recognizedRoles = ["ADMIN", "SUPER_ADMIN", "OWNER", "DRIVER"];
    if (auth && !recognizedRoles.includes(auth.role)) {
        return res.status(403).json({ message: "This account role cannot use fleet insights" });
    }

    try {
        const context = auth && !capabilityQuestion
            ? await buildAiContext(auth, parsed.data.message)
            : null;
        const groqResult = context?.intent === "location" || capabilityQuestion
            ? { reply: null, action: null, providerStatus: "not_used" as const }
            : await getGroqReply(parsed.data.message, context, language, auth);
        let proposalToken: string | undefined;
        if (groqResult.action && auth) {
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                return res.status(500).json({ message: "AI actions are not configured" });
            }
            proposalToken = jwt.sign({
                purpose: "ai-action-proposal",
                userId: auth.userId,
                role: auth.role,
                proposalId: randomUUID(),
                action: groqResult.action,
            }, jwtSecret, { expiresIn: "5m" });
        }
        return res.json({
            reply: capabilityQuestion
                ? createLocalReply(parsed.data.message, undefined, language)
                : groqResult.reply ?? createLocalReply(
                parsed.data.message,
                context ?? undefined,
                language,
            ),
            mode: !capabilityQuestion && (groqResult.reply || groqResult.action) ? "groq" : "local",
            providerStatus: groqResult.providerStatus,
            role: auth?.role ?? "GUEST",
            ...(proposalToken ? { proposal: { token: proposalToken, action: groqResult.action } } : {}),
        });
    } catch (error) {
        console.error("AI assistant request error:", error);
        return res.status(500).json({ message: "The assistant could not load role-specific information" });
    }
}

/** Confirm a signed, short-lived AI proposal; permissions are rechecked at execution. */
export async function confirmAction(req: Request, res: Response) {
    const auth = (req as AiRequest).auth;
    const parsedBody = confirmActionSchema.safeParse(req.body);
    if (!auth || !parsedBody.success) {
        return res.status(400).json({ message: "A valid AI action proposal is required" });
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ message: "AI actions are not configured" });

    try {
        const verified = jwt.verify(parsedBody.data.proposalToken, jwtSecret);
        const claims = proposalClaimsSchema.safeParse(verified);
        if (!claims.success || claims.data.userId !== auth.userId || claims.data.role !== auth.role) {
            return res.status(403).json({ message: "This proposal is invalid or belongs to another account" });
        }
        const action = parseAiProposedAction(claims.data.action);
        if (!action.success) return res.status(400).json({ message: "This proposal is no longer valid" });
        const alreadyApplied = await findConfirmedAiAction(claims.data.proposalId, auth.userId);
        if (alreadyApplied) return res.json(alreadyApplied);
        const result = await executeAiAction(auth, claims.data.proposalId, action.data);
        return res.json(result);
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
            return res.status(403).json({ message: "This proposal expired. Ask the assistant to prepare it again." });
        }
        if (error instanceof AiActionError) return res.status(400).json({ message: error.message });
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            try {
                const verified = jwt.verify(parsedBody.data.proposalToken, jwtSecret);
                const claims = proposalClaimsSchema.safeParse(verified);
                const completed = claims.success
                    ? await findConfirmedAiAction(claims.data.proposalId, auth.userId)
                    : null;
                if (completed) return res.json(completed);
            } catch (lookupError) {
                console.error("Look up completed AI action error:", lookupError);
            }
            return res.status(409).json({ message: "This proposal has already been confirmed" });
        }
        console.error("Confirm AI action error:", error);
        return res.status(500).json({ message: "Could not apply the proposed AI action" });
    }
}

/** Revert a persisted AI action only while its affected record is unchanged. */
export async function undoAction(req: Request, res: Response) {
    const auth = (req as AiRequest).auth;
    if (!auth || typeof req.params.actionId !== "string") {
        return res.status(400).json({ message: "A valid AI action ID is required" });
    }
    try {
        return res.json(await undoAiAction(auth, req.params.actionId));
    } catch (error) {
        if (error instanceof AiActionError) return res.status(409).json({ message: error.message });
        console.error("Undo AI action error:", error);
        return res.status(500).json({ message: "Could not undo the AI action" });
    }
}
