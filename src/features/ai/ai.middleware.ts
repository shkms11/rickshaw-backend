import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";

type AiRequest = {
    auth?: { userId: string; role: string };
};

export const optionalAuthentication: RequestHandler = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) return next();

    const token = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : "";
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) {
        return res.status(401).json({ message: "Invalid authentication token" });
    }

    try {
        const payload = jwt.verify(token, secret);
        if (
            typeof payload === "string" ||
            typeof payload.id !== "string" ||
            typeof payload.role !== "string"
        ) {
            return res.status(401).json({ message: "Invalid authentication token" });
        }
        (req as typeof req & AiRequest).auth = {
            userId: payload.id,
            role: payload.role,
        };
        return next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired authentication token" });
    }
};
