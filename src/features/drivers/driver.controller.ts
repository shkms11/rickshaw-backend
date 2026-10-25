import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";

const prisma = new PrismaClient();

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
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
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
        const { status } = req.body;

        if (!["ONLINE", "OFFLINE", "ON_TRIP"].includes(status)) {
            return res.status(400).json({
                message: "Invalid driver status",
            });
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
