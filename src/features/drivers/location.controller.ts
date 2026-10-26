import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { userId: string; role: string } };

const locationSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative().optional(),
});

export async function saveMyLocation(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    const parsed = locationSchema.safeParse(req.body);
    if (!auth || !parsed.success) {
        return res.status(400).json({ message: "Valid GPS coordinates are required" });
    }

    try {
        const driver = await prisma.driver.findUnique({
            where: { userId: auth.userId },
            select: { id: true },
        });
        if (!driver) {
            return res.status(404).json({ message: "Driver profile not found" });
        }

        const location = await prisma.driverLocation.upsert({
            where: { driverId: driver.id },
            create: {
                driverId: driver.id,
                latitude: parsed.data.latitude,
                longitude: parsed.data.longitude,
                accuracy: parsed.data.accuracy ?? null,
                source: "LIVE",
            },
            update: {
                latitude: parsed.data.latitude,
                longitude: parsed.data.longitude,
                accuracy: parsed.data.accuracy ?? null,
                source: "LIVE",
            },
            select: { latitude: true, longitude: true, accuracy: true, updatedAt: true },
        });
        await prisma.driver.update({
            where: { id: driver.id },
            data: { status: "ONLINE" },
        });
        return res.json({ location });
    } catch (error) {
        console.error("Save driver location error:", error);
        return res.status(500).json({ message: "Could not save GPS location" });
    }
}

export async function listDriverLocations(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    try {
        const locations = await prisma.driverLocation.findMany({
            where: {
                ...(auth.role === "OWNER"
                    ? { driver: { rickshaw: { owner: { userId: auth.userId } } } }
                    : {}),
            },
            select: {
                latitude: true,
                longitude: true,
                accuracy: true,
                source: true,
                updatedAt: true,
                driver: {
                    select: {
                        user: { select: { name: true } },
                        rickshaw: { select: { plateNo: true } },
                    },
                },
            },
            orderBy: { updatedAt: "desc" },
        });
        return res.json({
            locations: locations.map((location) => ({
                ...location,
                driverName: location.driver.user.name,
                rickshawPlate: location.driver.rickshaw?.plateNo ?? null,
                isLive: location.source === "LIVE" &&
                    Date.now() - location.updatedAt.getTime() <= 2 * 60 * 1000,
            })),
        });
    } catch (error) {
        console.error("List driver locations error:", error);
        return res.status(500).json({ message: "Could not load driver locations" });
    }
}

export async function stopMyLocation(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    try {
        const driver = await prisma.driver.findUnique({
            where: { userId: auth.userId },
            select: { id: true },
        });
        if (!driver) return res.status(404).json({ message: "Driver profile not found" });

        await prisma.$transaction([
            // Keep the last reported point so fleet managers can see its timestamp.
            prisma.driverLocation.updateMany({
                where: { driverId: driver.id, source: "LIVE" },
                data: { source: "LAST_KNOWN" },
            }),
            prisma.driver.update({
                where: { id: driver.id },
                data: { status: "OFFLINE" },
            }),
        ]);
        return res.json({ message: "GPS sharing stopped" });
    } catch (error) {
        console.error("Stop driver location error:", error);
        return res.status(500).json({ message: "Could not stop GPS sharing" });
    }
}
