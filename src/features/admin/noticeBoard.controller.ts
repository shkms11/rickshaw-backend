import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
const defaultNoticeItems = {
    admin: [
        "Review vehicle removal requests and lost-rickshaw alerts promptly.",
        "Use fleet controls to update vehicle and driver statuses.",
        "Registration approvals and user reports are available below.",
    ],
    owner: [
        "Search approved drivers by phone number before assigning a vehicle.",
        "A vehicle removal request takes effect only after admin approval.",
        "Lost-rickshaw alerts and admin decisions appear in your fleet.",
    ],
    driver: [
        "Turn on GPS sharing while working so your assigned vehicle can be tracked.",
        "Use the lost-rickshaw alert immediately if your assigned vehicle is missing.",
        "Send account or vehicle problems to the admin team from this dashboard.",
    ],
    "driver-health": [
        "Drink water regularly, especially during hot weather.",
        "Take short breaks to stretch and rest when it is safe.",
        "If you feel unwell, stop in a safe place and ask for help.",
    ],
} as const;
const audienceSchema = z.enum(["admin", "owner", "driver", "driver-health"]);
type Audience = z.infer<typeof audienceSchema>;
const noticeBoardSchema = z.object({
    items: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
});

type AuthRequest = Request & { auth?: { userId: string; role: string } };

function resolveAudience(req: Request, res: Response): Audience | undefined {
    const auth = (req as AuthRequest).auth;
    const parsed = audienceSchema.safeParse(req.query.audience ?? (
        auth?.role === "DRIVER" ? "driver" :
        auth?.role === "OWNER" ? "owner" : "admin"
    ));
    if (!parsed.success) {
        res.status(400).json({ message: "Audience must be admin, owner, or driver" });
        return undefined;
    }
    if (auth?.role !== "SUPER_ADMIN") {
        const roleAudience = auth?.role === "DRIVER" ? "driver" :
            auth?.role === "OWNER" ? "owner" : "admin";
        const canSeeDriverHealth = auth?.role === "DRIVER" && parsed.data === "driver-health";
        if (parsed.data !== roleAudience && !canSeeDriverHealth) {
            res.status(403).json({ message: "You cannot access another dashboard's notice board" });
            return undefined;
        }
    }
    return parsed.data;
}

export async function getAdminNoticeBoard(req: Request, res: Response) {
    const audience = resolveAudience(req, res);
    if (!audience) return;
    try {
        const board = await prisma.adminNoticeBoard.upsert({
            where: { id: audience },
            create: { id: audience, items: [...defaultNoticeItems[audience]] },
            update: {},
            select: { items: true, updatedAt: true },
        });
        const parsed = noticeBoardSchema.safeParse({ items: board.items });
        if (!parsed.success) {
            console.error("Stored notice board content is invalid:", parsed.error.flatten());
            return res.status(500).json({ message: "Notice board content is invalid" });
        }
        return res.json({ audience, items: parsed.data.items, updatedAt: board.updatedAt });
    } catch (error) {
        console.error("Load notice board error:", error);
        return res.status(500).json({ message: "Could not load notice board" });
    }
}

export async function updateAdminNoticeBoard(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth || auth.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Only a superadmin can edit notice boards" });
    }
    const audience = resolveAudience(req, res);
    if (!audience) return;
    const parsed = noticeBoardSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            message: "Add between 1 and 12 notice items, each up to 300 characters",
            errors: parsed.error.flatten(),
        });
    }

    try {
        const board = await prisma.adminNoticeBoard.upsert({
            where: { id: audience },
            create: {
                id: audience,
                items: parsed.data.items,
                updatedById: auth.userId,
            },
            update: {
                items: parsed.data.items,
                updatedById: auth.userId,
                updatedAt: new Date(),
            },
            select: { items: true, updatedAt: true },
        });
        return res.json({ audience, items: parsed.data.items, updatedAt: board.updatedAt });
    } catch (error) {
        console.error("Update notice board error:", error);
        return res.status(500).json({ message: "Could not update notice board" });
    }
}
