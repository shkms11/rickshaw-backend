import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { userId: string; role: string } };

const createSchema = z.object({
    plateNo: z.string().trim().min(2).max(32),
    model: z.string().trim().max(80).optional(),
});

export async function listRickshaws(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    try {
        const rickshaws = await prisma.rickshaw.findMany({
            where: auth.role === "OWNER" ? { owner: { userId: auth.userId } } : {},
            select: {
                id: true,
                plateNo: true,
                model: true,
                status: true,
                createdAt: true,
                driver: { select: { user: { select: { name: true } } } },
            },
            orderBy: { createdAt: "desc" },
        });
        return res.json({ rickshaws });
    } catch (error) {
        console.error("List rickshaws error:", error);
        return res.status(500).json({ message: "Could not load rickshaws" });
    }
}

export async function createRickshaw(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    const parsed = createSchema.safeParse(req.body);
    if (!auth || !parsed.success) {
        return res.status(400).json({ message: "A valid plate number is required" });
    }
    try {
        const owner = await prisma.owner.findUnique({
            where: { userId: auth.userId },
            select: { id: true },
        });
        if (!owner) return res.status(404).json({ message: "Owner profile not found" });

        const rickshaw = await prisma.rickshaw.create({
            data: {
                plateNo: parsed.data.plateNo,
                model: parsed.data.model || null,
                ownerId: owner.id,
            },
            select: { id: true, plateNo: true, model: true, status: true },
        });
        return res.status(201).json({ rickshaw });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return res.status(409).json({ message: "That plate number is already registered" });
        }
        console.error("Create rickshaw error:", error);
        return res.status(500).json({ message: "Could not register rickshaw" });
    }
}
