import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { userId: string; role: string } };

const createActionSchema = z.object({
    rickshawId: z.string().trim().min(1),
    message: z.string().trim().max(1000).optional(),
});
const reviewSchema = z.object({
    status: z.enum(["APPROVED", "REJECTED", "RESOLVED"]),
});
const activeTripStatuses = ["REQUESTED", "ACCEPTED", "IN_PROGRESS"] as const;

export async function listFleetActions(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    try {
        const actions = await prisma.fleetAction.findMany({
            where: auth.role === "OWNER"
                ? { rickshaw: { owner: { userId: auth.userId } } }
                : auth.role === "DRIVER"
                    ? { createdById: auth.userId }
                    : {},
            select: {
                id: true,
                type: true,
                status: true,
                message: true,
                createdAt: true,
                rickshaw: {
                    select: {
                        id: true,
                        plateNo: true,
                        owner: { select: { user: { select: { name: true, phone: true } } } },
                    },
                },
                createdBy: { select: { name: true, role: true, phone: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        return res.json({ actions });
    } catch (error) {
        console.error("List fleet actions error:", error);
        return res.status(500).json({ message: "Could not load fleet alerts and requests" });
    }
}

export async function createLostRickshawAlert(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    if (auth.role !== "OWNER" && auth.role !== "DRIVER") {
        return res.status(403).json({ message: "Only an owner or assigned driver can report a lost rickshaw" });
    }

    const parsed = createActionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "A valid rickshaw is required" });
    }

    try {
        const rickshaw = await prisma.rickshaw.findFirst({
            where: auth.role === "OWNER"
                ? { id: parsed.data.rickshawId, owner: { userId: auth.userId } }
                : { id: parsed.data.rickshawId, driver: { userId: auth.userId } },
            select: { id: true },
        });
        if (!rickshaw) return res.status(404).json({ message: "Assigned rickshaw not found" });

        const existingAlert = await prisma.fleetAction.findFirst({
            where: { rickshawId: rickshaw.id, type: "LOST_RICKSHAW", status: "OPEN" },
            select: { id: true },
        });
        if (existingAlert) {
            return res.status(409).json({ message: "An open lost-rickshaw alert already exists" });
        }

        const action = await prisma.fleetAction.create({
            data: {
                rickshawId: rickshaw.id,
                createdById: auth.userId,
                type: "LOST_RICKSHAW",
                message: parsed.data.message || null,
            },
            select: { id: true, status: true, createdAt: true },
        });
        return res.status(201).json({ action });
    } catch (error) {
        console.error("Create lost rickshaw alert error:", error);
        return res.status(500).json({ message: "Could not send lost-rickshaw alert" });
    }
}

export async function createRickshawRemovalRequest(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    const parsed = createActionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "A valid rickshaw is required" });
    }

    try {
        const rickshaw = await prisma.rickshaw.findFirst({
            where: { id: parsed.data.rickshawId, owner: { userId: auth.userId } },
            select: { id: true, status: true },
        });
        if (!rickshaw) return res.status(404).json({ message: "Rickshaw not found" });
        if (rickshaw.status === "INACTIVE") {
            return res.status(409).json({ message: "Rickshaw is already inactive" });
        }

        const activeTrip = await prisma.trip.findFirst({
            where: { rickshawId: rickshaw.id, status: { in: [...activeTripStatuses] } },
            select: { id: true },
        });
        if (activeTrip) {
            return res.status(409).json({ message: "Cannot request removal while the rickshaw has an active trip" });
        }

        const existingRequest = await prisma.fleetAction.findFirst({
            where: { rickshawId: rickshaw.id, type: "REMOVE_RICKSHAW", status: "OPEN" },
            select: { id: true },
        });
        if (existingRequest) {
            return res.status(409).json({ message: "A removal request is already awaiting admin approval" });
        }

        const action = await prisma.fleetAction.create({
            data: {
                rickshawId: rickshaw.id,
                createdById: auth.userId,
                type: "REMOVE_RICKSHAW",
                message: parsed.data.message || null,
            },
            select: { id: true, status: true, createdAt: true },
        });
        return res.status(201).json({ action });
    } catch (error) {
        console.error("Create rickshaw removal request error:", error);
        return res.status(500).json({ message: "Could not send rickshaw removal request" });
    }
}

export async function reviewFleetAction(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Choose an allowed review status" });
    }

    try {
        const result = await prisma.$transaction(async (transaction) => {
            const action = await transaction.fleetAction.findUnique({
                where: { id: req.params.id as string },
                select: { id: true, rickshawId: true, type: true, status: true },
            });
            if (!action) return { status: 404 as const, message: "Fleet action not found" };
            if (action.status !== "OPEN") {
                return { status: 409 as const, message: "Fleet action has already been reviewed" };
            }
            if (action.type === "REMOVE_RICKSHAW" && parsed.data.status === "RESOLVED") {
                return { status: 400 as const, message: "Removal requests must be approved or rejected" };
            }
            if (action.type === "LOST_RICKSHAW" && parsed.data.status !== "RESOLVED") {
                return { status: 400 as const, message: "Lost-rickshaw alerts must be resolved" };
            }

            if (action.type === "REMOVE_RICKSHAW" && parsed.data.status === "APPROVED") {
                const activeTrip = await transaction.trip.findFirst({
                    where: { rickshawId: action.rickshawId, status: { in: [...activeTripStatuses] } },
                    select: { id: true },
                });
                if (activeTrip) {
                    return { status: 409 as const, message: "Cannot approve removal while the rickshaw has an active trip" };
                }
            }

            const updated = await transaction.fleetAction.updateMany({
                where: { id: action.id, status: "OPEN" },
                data: { status: parsed.data.status, reviewedById: auth.userId },
            });
            if (updated.count === 0) {
                return { status: 409 as const, message: "Fleet action has already been reviewed" };
            }
            if (action.type === "REMOVE_RICKSHAW" && parsed.data.status === "APPROVED") {
                await transaction.rickshaw.update({
                    where: { id: action.rickshawId },
                    data: { status: "INACTIVE", driverId: null },
                });
            }
            return { status: 200 as const, message: "Fleet action updated" };
        });
        return res.status(result.status).json({ message: result.message });
    } catch (error) {
        console.error("Review fleet action error:", error);
        return res.status(500).json({ message: "Could not review fleet action" });
    }
}
