/** Optional JWT parsing lets guest chat stay public while enabling scoped insights. */
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../../generated/prisma/client.js";

type AiRequest = {
    auth?: { userId: string; role: string; ownerIds?: string[]; isObserver?: boolean; allOwnersAccess?: boolean };
};
const prisma = new PrismaClient();

/** Attach a verified identity when supplied; reject malformed supplied tokens. */
export const optionalAuthentication: RequestHandler = async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) return next();

    const token = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : "";
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) {
        return res.status(401).json({ message: "Invalid authentication token" });
    }

    let payload: string | jwt.JwtPayload;
    try {
        payload = jwt.verify(token, secret);
    } catch {
        return res.status(401).json({ message: "Invalid or expired authentication token" });
    }
    if (
        typeof payload === "string" ||
        typeof payload.id !== "string" ||
        typeof payload.role !== "string"
    ) {
        return res.status(401).json({ message: "Invalid authentication token" });
    }
    const auth: NonNullable<AiRequest["auth"]> = {
        userId: payload.id,
        role: payload.role,
    };
    if (auth.role === "ADMIN") {
        try {
            const assignments = await prisma.adminAssignment.findMany({
                where: { adminId: auth.userId },
                select: { ownerId: true, isObserver: true },
            });
            const ownerIds = assignments.flatMap((assignment) =>
                assignment.ownerId ? [assignment.ownerId] : [],
            );
            const isObserver = assignments.some((assignment) => assignment.isObserver);
            const allOwnersAccess = assignments.some(
                (assignment) => assignment.ownerId === null && !assignment.isObserver,
            );
            if (!ownerIds.length && !isObserver && !allOwnersAccess) {
                return res.status(403).json({
                    message: "This admin account is not assigned to an owner",
                });
            }
            auth.ownerIds = ownerIds;
            auth.isObserver = isObserver && !allOwnersAccess;
            auth.allOwnersAccess = allOwnersAccess;
        } catch (error) {
            console.error("Verify AI admin owner assignment error:", error);
            return res.status(500).json({ message: "Could not verify admin access" });
        }
    }
    (req as typeof req & AiRequest).auth = auth;
    return next();
};
