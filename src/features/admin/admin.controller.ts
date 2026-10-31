import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { phoneSearchDigits } from "../../shared/phone.js";

const prisma = new PrismaClient();

export async function getDashboardSummary(_req: Request, res: Response) {
    try {
        const [totalRickshaws, onlineDrivers, activeTrips, openComplaints] =
            await Promise.all([
                prisma.rickshaw.count(),
                prisma.driverLocation.count({
                    where: {
                        source: "LIVE",
                        updatedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
                    },
                }),
                prisma.trip.count({
                    where: { status: { in: ["REQUESTED", "ACCEPTED", "IN_PROGRESS"] } },
                }),
                prisma.complaint.count({ where: { status: "OPEN" } }),
            ]);
        return res.json({ totalRickshaws, onlineDrivers, activeTrips, openComplaints });
    } catch (error) {
        console.error("Load admin dashboard summary error:", error);
        return res.status(500).json({ message: "Could not load dashboard summary" });
    }
}

export async function listPendingApprovals(_req: Request, res: Response) {
    try {
        const approvals = await prisma.user.findMany({
            where: {
                approvalStatus: "PENDING",
                role: { in: ["DRIVER", "OWNER"] },
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
            },
            orderBy: { createdAt: "asc" },
        });
        return res.json({ approvals });
    } catch (error) {
        console.error("Load pending approvals error:", error);
        return res.status(500).json({ message: "Could not load pending approvals" });
    }
}

export async function decideApproval(req: Request, res: Response) {
    const status = req.body?.status;
    if (status !== "APPROVED" && status !== "REJECTED") {
        return res.status(400).json({ message: "Choose APPROVED or REJECTED" });
    }
    const userId = typeof req.params.userId === "string" ? req.params.userId : "";
    if (!userId) return res.status(400).json({ message: "A user ID is required" });
    try {
        const result = await prisma.user.updateMany({
            where: {
                id: userId,
                role: { in: ["DRIVER", "OWNER"] },
                approvalStatus: "PENDING",
            },
            data: { approvalStatus: status },
        });
        if (result.count === 0) {
            return res.status(404).json({ message: "Pending registration not found" });
        }
        return res.json({ message: `Registration ${status.toLowerCase()}` });
    } catch (error) {
        console.error("Update registration approval error:", error);
        return res.status(500).json({ message: "Could not update registration approval" });
    }
}

type ResultType = "driver" | "owner" | "user" | "rickshaw" | "location" | "payment" | "complaint";
type SearchResult = { id: string; name: string; type: ResultType; description?: string };

function textFilter(query: string) {
    const phoneDigits = phoneSearchDigits(query);
    const filters: Array<Record<string, unknown>> = [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
    ];
    if (phoneDigits.length >= 4) {
        filters.push({ phone: { contains: phoneDigits } });
    }
    return filters;
}

function phoneRelationFilter(query: string) {
    const phoneDigits = phoneSearchDigits(query);
    return phoneDigits.length >= 4 ? [{ phone: { contains: phoneDigits } }] : [];
}

export async function searchAdmin(req: Request, res: Response) {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const selectedType = typeof req.query.type === "string" ? req.query.type.toLowerCase() : "all";
    if (query.length < 2) {
        return res.status(400).json({ message: "Enter at least two characters to search" });
    }
    const allowedTypes = ["all", "drivers", "owners", "rickshaws", "location", "complaints"];
    if (!allowedTypes.includes(selectedType)) {
        return res.status(400).json({ message: "Unsupported search category" });
    }

    try {
        const searchAll = selectedType === "all";
        const userFilters = textFilter(query);
        const phoneFilters = phoneRelationFilter(query);
        const results: SearchResult[] = [];

        if (searchAll || selectedType === "drivers" || selectedType === "owners") {
            const users = await prisma.user.findMany({
                where: {
                    ...(selectedType === "drivers" ? { driver: { isNot: null } } : {}),
                    ...(selectedType === "owners" ? { owner: { isNot: null } } : {}),
                    OR: userFilters,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    driver: { select: { id: true, licenseNo: true } },
                    owner: { select: { id: true } },
                },
                take: 25,
                orderBy: { name: "asc" },
            });
            results.push(...users.map<SearchResult>((user) => ({
                id: user.driver?.id ?? user.id,
                name: user.name,
                type: user.driver ? "driver" : user.owner ? "owner" : "user",
                description: [
                    user.phone,
                    user.email,
                    user.driver?.licenseNo ? `License ${user.driver.licenseNo}` : null,
                ].filter(Boolean).join(" · "),
            })));
        }

        if (searchAll || selectedType === "rickshaws") {
            const rickshaws = await prisma.rickshaw.findMany({
                where: {
                    OR: [
                        { plateNo: { contains: query, mode: "insensitive" } },
                        { model: { contains: query, mode: "insensitive" } },
                        { owner: { user: { OR: userFilters } } },
                        { driver: { user: { OR: userFilters } } },
                    ],
                },
                select: {
                    id: true,
                    plateNo: true,
                    model: true,
                    status: true,
                    owner: { select: { user: { select: { name: true, phone: true } } } },
                    driver: { select: { user: { select: { name: true, phone: true } }, location: { select: { latitude: true, longitude: true, updatedAt: true, source: true } } } },
                },
                take: 25,
            });
            results.push(...rickshaws.map<SearchResult>((vehicle) => ({
                id: vehicle.id,
                name: vehicle.plateNo,
                type: "rickshaw",
                description: [
                    vehicle.model,
                    vehicle.status,
                    `Owner: ${vehicle.owner.user.name}${vehicle.owner.user.phone ? ` (${vehicle.owner.user.phone})` : ""}`,
                    vehicle.driver ? `Driver: ${vehicle.driver.user.name}${vehicle.driver.user.phone ? ` (${vehicle.driver.user.phone})` : ""}` : null,
                    vehicle.driver?.location ? `${vehicle.driver.location.source === "DEMO" ? "DEMO SAMPLE" : "Last location"}: ${vehicle.driver.location.latitude}, ${vehicle.driver.location.longitude}` : null,
                ].filter(Boolean).join(" · "),
            })));
        }

        if (searchAll || selectedType === "location") {
            const [trips, locations] = await Promise.all([
                prisma.trip.findMany({
                    where: {
                        OR: [
                            { pickupLocation: { contains: query, mode: "insensitive" } },
                            { dropoffLocation: { contains: query, mode: "insensitive" } },
                            { passenger: { OR: userFilters } },
                            { driver: { OR: userFilters } },
                            { rickshaw: { plateNo: { contains: query, mode: "insensitive" } } },
                        ],
                    },
                    select: {
                        id: true,
                        pickupLocation: true,
                        dropoffLocation: true,
                        status: true,
                        passenger: { select: { name: true, phone: true } },
                    },
                    take: 25,
                }),
                prisma.driverLocation.findMany({
                    where: {
                        OR: [
                            { driver: { user: { OR: [...userFilters, ...phoneFilters] } } },
                            { driver: { rickshaw: { plateNo: { contains: query, mode: "insensitive" } } } },
                        ],
                    },
                    select: {
                        id: true,
                        latitude: true,
                        longitude: true,
                        updatedAt: true,
                        source: true,
                        driver: {
                            select: {
                                user: { select: { name: true, phone: true } },
                                rickshaw: { select: { plateNo: true } },
                            },
                        },
                    },
                    take: 25,
                }),
            ]);
            results.push(...trips.map<SearchResult>((trip) => ({
                id: trip.id,
                name: `${trip.pickupLocation} → ${trip.dropoffLocation}`,
                type: "location",
                description: `Trip ${trip.status} · ${trip.passenger.name}${trip.passenger.phone ? ` (${trip.passenger.phone})` : ""}`,
            })));
            results.push(...locations.map<SearchResult>((location) => ({
                id: location.id,
                name: `${location.driver.user.name} · ${location.driver.rickshaw?.plateNo ?? "No vehicle"}`,
                type: "location",
                description: `${location.source === "DEMO" ? "DEMO SAMPLE LOCATION" : "Last reported GPS"}: ${location.latitude}, ${location.longitude} · ${location.updatedAt.toISOString()}${location.driver.user.phone ? ` · ${location.driver.user.phone}` : ""}`,
            })));
        }

        if (searchAll) {
            const payments = await prisma.payment.findMany({
                where: {
                    OR: [
                        { user: { OR: [...userFilters, ...phoneFilters] } },
                        { trip: { pickupLocation: { contains: query, mode: "insensitive" } } },
                        { trip: { dropoffLocation: { contains: query, mode: "insensitive" } } },
                        { trip: { rickshaw: { plateNo: { contains: query, mode: "insensitive" } } } },
                    ],
                },
                select: {
                    id: true,
                    amount: true,
                    method: true,
                    status: true,
                    user: { select: { name: true, phone: true } },
                    trip: { select: { pickupLocation: true, dropoffLocation: true } },
                },
                take: 25,
            });
            results.push(...payments.map<SearchResult>((payment) => ({
                id: payment.id,
                name: `Payment · ${payment.amount.toString()}`,
                type: "payment",
                description: `${payment.status} · ${payment.method} · ${payment.user.name}${payment.user.phone ? ` (${payment.user.phone})` : ""} · ${payment.trip.pickupLocation} → ${payment.trip.dropoffLocation}`,
            })));
        }

        if (searchAll || selectedType === "complaints") {
            const complaints = await prisma.complaint.findMany({
                where: {
                    OR: [
                        { subject: { contains: query, mode: "insensitive" } },
                        { description: { contains: query, mode: "insensitive" } },
                        { user: { OR: userFilters } },
                        { user: { OR: phoneFilters } },
                    ],
                },
                select: {
                    id: true,
                    subject: true,
                    status: true,
                    user: { select: { name: true, phone: true } },
                },
                take: 25,
            });
            results.push(...complaints.map<SearchResult>((complaint) => ({
                id: complaint.id,
                name: complaint.subject,
                type: "complaint",
                description: `${complaint.status} · ${complaint.user.name}${complaint.user.phone ? ` (${complaint.user.phone})` : ""}`,
            })));
        }

        return res.json({ results: results.slice(0, 50), total: results.length });
    } catch (error) {
        console.error("Admin search error:", error);
        return res.status(500).json({ message: "Search failed" });
    }
}
