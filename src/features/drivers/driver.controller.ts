import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { userId: string; role: string } };

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

// Create a driver profile
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

// Get all drivers
export const getDrivers = async (_req: Request, res: Response) => {
    try {
        const drivers = await prisma.driver.findMany({
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
        });

        return res.json(drivers);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to fetch drivers",
        });
    }
};

// Get one driver by ID
export const getDriverById = async (req: Request, res: Response) => {
    try {
        const driver = await prisma.driver.findUnique({
            where: { id: req.params.id as string },
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

// Update driver status
export const updateDriverStatus = async (req: Request, res: Response) => {
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

        const driver = await prisma.driver.update({
            where: { id: req.params.id as string },
            data: { status },
        });

        return res.json({
            message: "Driver status updated",
            driver,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to update driver status",
        });
    }
};
