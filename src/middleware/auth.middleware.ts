import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";

type AuthorizedRole = "ADMIN" | "SUPER_ADMIN" | "OWNER" | "DRIVER";
type AuthenticatedRequest = Request & {
    auth?: { userId: string; role: string };
};

export const authenticate: RequestHandler = (req, res, next) => {
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

    try {
        const payload = jwt.verify(token, jwtSecret);
        if (
            typeof payload === "string" ||
            typeof payload.id !== "string" ||
            typeof payload.role !== "string"
        ) {
            return res
                .status(401)
                .json({ message: "Invalid authentication token" });
        }

        (req as AuthenticatedRequest).auth = {
            userId: payload.id,
            role: payload.role,
        };
        next();
    } catch {
        return res
            .status(401)
            .json({ message: "Invalid or expired authentication token" });
    }
};

export const requireRole =
    (...roles: AuthorizedRole[]): RequestHandler =>
    (req, res, next) => {
        const auth = (req as AuthenticatedRequest).auth;
        if (!auth || !roles.includes(auth.role as AuthorizedRole)) {
            return res
                .status(403)
                .json({
                    message:
                        "You do not have permission to access this resource",
                });
        }

        next();
    };
