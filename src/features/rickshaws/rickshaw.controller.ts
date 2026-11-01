/** Manage owner fleets and driver assignments using the Rickshaw relations. */
import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";
import { normalizeBangladeshPhone } from "../../shared/phone.js";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { userId: string; role: string; ownerIds?: string[] } };

const createSchema = z.object({
    model: z.string().trim().max(80).optional(),
});
const assignDriverSchema = z.object({
    driverId: z.string().trim().min(1).nullable(),
});

const activeTripStatuses = ["REQUESTED", "ACCEPTED", "IN_PROGRESS"] as const;

/** List all vehicles for admins or only the caller's vehicles for owners. */
export async function listRickshaws(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    try {
        const rickshaws = await prisma.rickshaw.findMany({
            where: auth.role === "OWNER"
                ? { owner: { userId: auth.userId } }
                : auth.role === "ADMIN" && auth.ownerIds?.length
                    ? { ownerId: { in: auth.ownerIds } }
                    : {},
            select: {
                id: true,
                plateNo: true,
                model: true,
                status: true,
                createdAt: true,
                driver: {
                    select: {
                        id: true,
                        status: true,
                        user: { select: { name: true, phone: true } },
                    },
                },
                owner: { select: { user: { select: { name: true, phone: true } } } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        return res.json({ rickshaws });
    } catch (error) {
        console.error("List rickshaws error:", error);
        return res.status(500).json({ message: "Could not load rickshaws" });
    }
}

/** Create a vehicle under the owner profile associated with the caller's user ID. */
export async function createRickshaw(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    const parsed = createSchema.safeParse(req.body);
    if (!auth || !parsed.success) {
        return res.status(400).json({ message: "Invalid rickshaw details" });
    }
    try {
        const rickshaw = await prisma.$transaction(async (transaction) => {
            const owner = await transaction.owner.update({
                where: { userId: auth.userId },
                data: { rickshawSequence: { increment: 1 } },
                select: {
                    id: true,
                    rickshawSequence: true,
                    user: { select: { phone: true } },
                },
            });
            const ownerNumber = owner.user.phone?.replace(/\D/g, "") || owner.id.slice(-8).toUpperCase();
            const plateNo = `${ownerNumber}-${owner.rickshawSequence}`;
            return transaction.rickshaw.create({
                data: {
                    plateNo,
                    model: parsed.data.model || null,
                    ownerId: owner.id,
                },
                select: { id: true, plateNo: true, model: true, status: true },
            });
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

/** Find approved drivers who are free or already assigned within this owner's fleet. */
export async function listOwnerDrivers(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    const phoneQuery = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
    const normalizedPhone = phoneQuery ? normalizeBangladeshPhone(phoneQuery) : null;
    if (phoneQuery && !normalizedPhone) {
        return res.status(400).json({ message: "Enter a valid Bangladesh mobile number" });
    }

    try {
        const drivers = await prisma.driver.findMany({
            where: {
                user: {
                    approvalStatus: "APPROVED",
                    ...(normalizedPhone ? { phone: normalizedPhone } : {}),
                },
                OR: [
                    { rickshaw: { is: null } },
                    { rickshaw: { is: { owner: { userId: auth.userId } } } },
                ],
            },
            select: {
                id: true,
                status: true,
                user: { select: { name: true, phone: true } },
                rickshaw: { select: { id: true, plateNo: true } },
            },
            orderBy: { user: { name: "asc" } },
        });
        return res.json({ drivers });
    } catch (error) {
        console.error("List owner drivers error:", error);
        return res.status(500).json({ message: "Could not load available drivers" });
    }
}

/** Validate ownership, driver approval, and trip state before changing assignment. */
export async function assignRickshawDriver(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    const parsed = assignDriverSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Choose a valid driver or leave the vehicle unassigned" });
    }

    try {
        const rickshaw = await prisma.rickshaw.findFirst({
            where: { id: req.params.id as string, owner: { userId: auth.userId } },
            select: { id: true, driverId: true, status: true },
        });
        if (!rickshaw) return res.status(404).json({ message: "Rickshaw not found" });
        if (rickshaw.status !== "ACTIVE") {
            return res.status(409).json({ message: "Only active rickshaws can be assigned a driver" });
        }
        if (rickshaw.driverId === parsed.data.driverId) {
            return res.json({ message: "Driver assignment is unchanged" });
        }

        const activeTrip = await prisma.trip.findFirst({
            where: { rickshawId: rickshaw.id, status: { in: [...activeTripStatuses] } },
            select: { id: true },
        });
        if (activeTrip) {
            return res.status(409).json({ message: "Cannot change the driver while the rickshaw has an active trip" });
        }

        if (parsed.data.driverId) {
            const driver = await prisma.driver.findUnique({
                where: { id: parsed.data.driverId },
                select: {
                    id: true,
                    user: { select: { approvalStatus: true } },
                    rickshaw: { select: { id: true, owner: { select: { userId: true } } } },
                },
            });
            if (!driver || driver.user.approvalStatus !== "APPROVED") {
                return res.status(404).json({ message: "Approved driver not found" });
            }
            if (driver.rickshaw && driver.rickshaw.id !== rickshaw.id) {
                const message = driver.rickshaw.owner.userId === auth.userId
                    ? "Unassign this driver from their current rickshaw first"
                    : "This driver is assigned to another owner's rickshaw";
                return res.status(409).json({ message });
            }
        }

        const result = await prisma.rickshaw.updateMany({
            where: { id: rickshaw.id, owner: { userId: auth.userId } },
            data: { driverId: parsed.data.driverId },
        });
        if (result.count === 0) return res.status(404).json({ message: "Rickshaw not found" });
        return res.json({ message: "Driver assignment updated" });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return res.status(409).json({ message: "This driver is already assigned to another rickshaw" });
        }
        console.error("Assign rickshaw driver error:", error);
        return res.status(500).json({ message: "Could not update driver assignment" });
    }
}

/** Change vehicle availability and clear its driver when it becomes inactive. */
export async function updateRickshawStatus(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    const statusSchema = z.object({
        status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]),
    });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Choose ACTIVE, INACTIVE, or MAINTENANCE" });
    }

    try {
        if (parsed.data.status !== "ACTIVE") {
            const activeTrip = await prisma.trip.findFirst({
                where: {
                    rickshawId: req.params.id as string,
                    ...(auth?.role === "ADMIN" && auth.ownerIds?.length
                        ? { rickshaw: { ownerId: { in: auth.ownerIds } } }
                        : {}),
                    status: { in: [...activeTripStatuses] },
                },
                select: { id: true },
            });
            if (activeTrip) {
                return res.status(409).json({ message: "Cannot change vehicle status while it has an active trip" });
            }
        }
        const result = await prisma.rickshaw.updateMany({
            where: {
                id: req.params.id as string,
                ...(auth?.role === "ADMIN" && auth.ownerIds?.length
                    ? { ownerId: { in: auth.ownerIds } }
                    : {}),
            },
            data: {
                status: parsed.data.status,
                ...(parsed.data.status === "INACTIVE" ? { driverId: null } : {}),
            },
        });
        if (result.count === 0) return res.status(404).json({ message: "Rickshaw not found" });
        return res.json({ message: "Rickshaw status updated" });
    } catch (error) {
        console.error("Update rickshaw status error:", error);
        return res.status(500).json({ message: "Could not update rickshaw status" });
    }
}
