/** Driver profile and status endpoints; profile data is joined from User and fleet records. */
import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { userId: string; role: string; ownerIds?: string[] } };
const driverActivityEntrySchema = z.object({
    workDate: z.iso.date(),
    fare: z.coerce.number().finite().min(0.01).max(100_000),
    distanceKm: z.coerce.number().finite().min(0).max(200),
});
const driverActivityPeriodSchema = z.enum(["today", "week", "month", "year", "all"]);

function dhakaDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    return {
        year: Number(parts.find((part) => part.type === "year")?.value),
        month: Number(parts.find((part) => part.type === "month")?.value),
        day: Number(parts.find((part) => part.type === "day")?.value),
    };
}

function getActivityDateRange(period: z.infer<typeof driverActivityPeriodSchema>) {
    if (period === "all") return null;
    const { year, month, day } = dhakaDateParts(new Date());
    const today = new Date(Date.UTC(year, month - 1, day));
    const start = new Date(today);
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + 1);
    if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
    if (period === "month") start.setUTCDate(1);
    if (period === "year") {
        start.setUTCMonth(0, 1);
    }
    return { gte: start, lt: end };
}

/** Return the signed-in driver's account, assignment, and GPS freshness. */
export const getMyDriverProfile = async (req: Request, res: Response) => {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    try {
        const driver = await prisma.driver.findUnique({
            where: { userId: auth.userId },
            select: {
                id: true,
                licenseNo: true,
                status: true,
                user: { select: { name: true, phone: true } },
                rickshaw: {
                    select: {
                        id: true,
                        plateNo: true,
                        model: true,
                        status: true,
                        owner: { select: { user: { select: { name: true, phone: true } } } },
                    },
                },
                location: { select: { source: true, updatedAt: true } },
            },
        });
        if (!driver) return res.status(404).json({ message: "Driver profile not found" });
        return res.json({
            driver: {
                ...driver,
                location: driver.location
                    ? {
                        ...driver.location,
                        isLive: driver.location.source === "LIVE" &&
                            Date.now() - driver.location.updatedAt.getTime() <= 2 * 60 * 1000,
                    }
                    : null,
            },
        });
    } catch (error) {
        console.error("Load driver profile error:", error);
        return res.status(500).json({ message: "Could not load driver profile" });
    }
};

/** Return the authenticated driver's self-reported activity totals for a selected period. */
export const getMyDriverStats = async (req: Request, res: Response) => {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    const parsedPeriod = driverActivityPeriodSchema.safeParse(req.query.period ?? "all");
    if (!parsedPeriod.success) {
        return res.status(400).json({ message: "Choose a valid activity period" });
    }
    try {
        const range = getActivityDateRange(parsedPeriod.data);
        const where = {
            driverId: auth.userId,
            ...(range ? { workDate: range } : {}),
        };
        const [totals, entries] = await Promise.all([
            prisma.driverActivityEntry.aggregate({
                where,
                _count: { _all: true },
                _sum: { fare: true, distanceKm: true },
            }),
            prisma.driverActivityEntry.findMany({
                where,
                orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
                take: 10,
                select: { id: true, workDate: true, fare: true, distanceKm: true },
            }),
        ]);
        return res.json({
            period: parsedPeriod.data,
            totalTrips: totals._count._all,
            totalFare: totals._sum.fare?.toString() ?? "0",
            totalDistanceKm: totals._sum.distanceKm ?? 0,
            entries: entries.map((entry) => ({
                id: entry.id,
                workDate: entry.workDate.toISOString().slice(0, 10),
                fare: entry.fare.toString(),
                distanceKm: entry.distanceKm,
            })),
        });
    } catch (error) {
        console.error("Load driver activity stats error:", error);
        return res.status(500).json({ message: "Could not load driver activity stats" });
    }
};

/** Add a self-reported trip for the authenticated driver. */
export const addMyDriverActivityEntry = async (req: Request, res: Response) => {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    const parsed = driverActivityEntrySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            message: "Enter a valid trip date, fare, and distance (up to 200 km per trip)",
            errors: parsed.error.flatten(),
        });
    }
    const { year, month, day } = dhakaDateParts(new Date());
    const today = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (parsed.data.workDate > today) {
        return res.status(400).json({ message: "Trip date cannot be in the future" });
    }
    try {
        const entry = await prisma.driverActivityEntry.create({
            data: {
                driverId: auth.userId,
                workDate: new Date(`${parsed.data.workDate}T00:00:00.000Z`),
                fare: parsed.data.fare,
                distanceKm: parsed.data.distanceKm,
            },
            select: { id: true, workDate: true, fare: true, distanceKm: true },
        });
        return res.status(201).json({
            entry: {
                id: entry.id,
                workDate: entry.workDate.toISOString().slice(0, 10),
                fare: entry.fare.toString(),
                distanceKm: entry.distanceKm,
            },
        });
    } catch (error) {
        console.error("Save driver activity entry error:", error);
        return res.status(500).json({ message: "Could not save your trip entry" });
    }
};

/** Create a driver profile for an existing user (admin endpoint). */
export const createDriver = async (req: Request, res: Response) => {
    try {
        const { userId, licenseNo } = req.body;

        if (!userId || !licenseNo) {
            return res.status(400).json({
                message: "User ID and license number are required",
            });
        }

        const driver = await prisma.driver.create({
            data: {
                userId,
                licenseNo,
            },
        });

        return res.status(201).json({
            message: "Driver profile created successfully",
            driver,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to create driver profile",
        });
    }
};

/** List drivers with the related account and current vehicle assignment. */
export const getDrivers = async (req: Request, res: Response) => {
    const auth = (req as AuthRequest).auth;
    try {
        const drivers = await prisma.driver.findMany({
            where: auth?.role === "ADMIN" && auth.ownerIds?.length
                ? { rickshaw: { is: { ownerId: { in: auth.ownerIds } } } }
                : {},
            select: {
                id: true,
                status: true,
                licenseNo: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        role: true,
                        approvalStatus: true,
                    },
                },
                rickshaw: { select: { id: true, plateNo: true } },
            },
            orderBy: { user: { name: "asc" } },
            take: 100,
        });

        return res.json(drivers);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to fetch drivers",
        });
    }
};

/** Load one driver and its user/vehicle relations for admin detail views. */
export const getDriverById = async (req: Request, res: Response) => {
    const auth = (req as AuthRequest).auth;
    try {
        const driver = await prisma.driver.findFirst({
            where: {
                id: req.params.id as string,
                ...(auth?.role === "ADMIN" && auth.ownerIds?.length
                    ? { rickshaw: { is: { ownerId: { in: auth.ownerIds } } } }
                    : {}),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                rickshaw: true,
            },
        });

        if (!driver) {
            return res.status(404).json({
                message: "Driver not found",
            });
        }

        return res.json(driver);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to fetch driver",
        });
    }
};

/** Update driver availability; ONLINE requires a recently saved live GPS point. */
export const updateDriverStatus = async (req: Request, res: Response) => {
    const auth = (req as AuthRequest).auth;
    try {
        const status = req.body?.status;

        if (!["ONLINE", "OFFLINE", "ON_TRIP"].includes(status)) {
            return res.status(400).json({
                message: "Invalid driver status",
            });
        }

        if (status === "ONLINE") {
            const liveLocation = await prisma.driverLocation.findFirst({
                where: {
                    driverId: req.params.id as string,
                    ...(auth?.role === "ADMIN" && auth.ownerIds?.length
                        ? { driver: { rickshaw: { is: { ownerId: { in: auth.ownerIds } } } } }
                        : {}),
                    source: "LIVE",
                    updatedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
                },
                select: { id: true },
            });
            if (!liveLocation) {
                return res.status(409).json({
                    message: "Driver must share GPS before being marked online",
                });
            }
        }

        const result = await prisma.driver.updateMany({
            where: {
                id: req.params.id as string,
                ...(auth?.role === "ADMIN" && auth.ownerIds?.length
                    ? { rickshaw: { is: { ownerId: { in: auth.ownerIds } } } }
                    : {}),
            },
            data: { status },
        });
        if (result.count === 0) return res.status(404).json({ message: "Driver not found" });

        return res.json({
            message: "Driver status updated",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to update driver status",
        });
    }
};
