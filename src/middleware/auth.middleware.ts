/** Verify bearer JWTs and enforce role gates before protected controllers run. */
import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/prisma/client.js";

type AuthorizedRole = "ADMIN" | "SUPER_ADMIN" | "OWNER" | "DRIVER";
type AuthenticatedRequest = Request & {
    auth?: {
        userId: string;
        role: string;
        ownerIds?: string[];
        isObserver?: boolean;
        allOwnersAccess?: boolean;
    };
};
const prisma = new PrismaClient();

/** Verify the bearer token and attach its user ID and role to the request. */
export const authenticate: RequestHandler = async (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : undefined;

    if (!token) {
        return res
            .status(401)
            .json({ message: "Authentication token required" });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        return res
            .status(500)
            .json({ message: "Authentication is not configured" });
    }

    let payload: string | jwt.JwtPayload;
    try {
        payload = jwt.verify(token, jwtSecret);
    } catch {
        return res
            .status(401)
            .json({ message: "Invalid or expired authentication token" });
    }

    if (
        typeof payload === "string" ||
        typeof payload.id !== "string" ||
        typeof payload.role !== "string"
    ) {
        return res
            .status(401)
            .json({ message: "Invalid authentication token" });
    }

    try {
        const account = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { isRestricted: true },
        });
        if (!account) {
            return res.status(401).json({ message: "Account is no longer available" });
        }
        if (account.isRestricted) {
            return res.status(403).json({
                code: "ACCOUNT_RESTRICTED",
                message: "Your account has been restricted. Contact an administrator.",
            });
        }
        (req as AuthenticatedRequest).auth = {
            userId: payload.id,
            role: payload.role,
        };
        return next();
    } catch (error) {
        console.error("Verify account access error:", error);
        return res.status(500).json({ message: "Could not verify account access" });
    }
};

/** Build a route guard that allows only the listed authenticated roles. */
export const requireRole =
    (...roles: AuthorizedRole[]): RequestHandler =>
    async (req, res, next) => {
        const auth = (req as AuthenticatedRequest).auth;
        if (!auth || !roles.includes(auth.role as AuthorizedRole)) {
            return res
                .status(403)
                .json({
                    message:
                        "You do not have permission to access this resource",
                });
        }

        if (auth.role === "ADMIN") {
            try {
                const assignments = await prisma.adminAssignment.findMany({
                    where: { adminId: auth.userId },
                    select: { ownerId: true, isObserver: true },
                });
                const allOwnersAccess = assignments.some(
                    (assignment) => assignment.ownerId === null && !assignment.isObserver,
                );
                const ownerIds = assignments.flatMap((assignment) =>
                    assignment.ownerId ? [assignment.ownerId] : [],
                );
                const isObserver = assignments.some((assignment) => assignment.isObserver);
                if (ownerIds.length === 0 && !isObserver && !allOwnersAccess) {
                    return res.status(403).json({
                        message: "This admin account is not assigned to an owner",
                    });
                }
                auth.ownerIds = ownerIds;
                auth.isObserver = isObserver && !allOwnersAccess;
                auth.allOwnersAccess = allOwnersAccess;
            } catch (error) {
                console.error("Load admin owner assignment error:", error);
                return res.status(500).json({ message: "Could not verify admin access" });
            }
        }

        next();
    };

/** Global-owner observers can view, but cannot make changes to, platform data. */
export const requireScopedAdmin: RequestHandler = (req, res, next) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (auth?.role === "ADMIN" && auth.isObserver) {
        return res.status(403).json({ message: "Observer admin accounts cannot make changes" });
    }
    return next();
};
