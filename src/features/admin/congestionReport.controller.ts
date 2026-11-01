import type { Request, Response } from "express";
import { z } from "zod";

import { getAreaUsage, type AiIdentity } from "../ai/ai.service.js";

type AuthRequest = Request & { auth?: AiIdentity };
const areaSchema = z.string().trim().min(2).max(100);

export async function getCongestionReport(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    const parsedArea = areaSchema.safeParse(req.query.area);
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    if (!parsedArea.success) {
        return res.status(400).json({ message: "Enter an area name between 2 and 100 characters" });
    }

    try {
        const report = await getAreaUsage(auth, `trips in ${parsedArea.data}`);
        return res.json({
            ...report,
            limitation: "This is an activity snapshot, not a confirmed congestion diagnosis. Only the latest GPS point per driver is stored; speed, stopping duration, and traffic blockage cannot be measured.",
            driverDirections: "No drivers were automatically notified or directed. Review the report and use the announcement manager for any safety update.",
        });
    } catch (error) {
        console.error("Load congestion activity report error:", error);
        return res.status(500).json({ message: "Could not load area activity report" });
    }
}
