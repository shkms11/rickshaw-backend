/** Admin read/write operations over users, fleet, locations, trips, and reports. */
import type { Request, Response } from "express";
import { PrismaClient, type Prisma } from "../../generated/prisma/client.js";
import { phoneSearchDigits } from "../../shared/phone.js";
import { normalizeBangladeshPhone } from "../../shared/phone.js";
import bcrypt from "bcrypt";
import { z } from "zod";

const prisma = new PrismaClient();
const adminPasswordMinimumLength = process.env.NODE_ENV === "production" ? 12 : 4;
type AuthRequest = Request & { auth?: { userId: string; role: string; ownerIds?: string[]; isObserver?: boolean; allOwnersAccess?: boolean } };

const createAdminSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().pipe(z.email()),
    phone: z.string().trim().min(1),
    password: z.string().min(adminPasswordMinimumLength).max(128),
    ownerIds: z.array(z.string().trim().min(1)).max(100).default([]),
    allOwnersObserver: z.boolean().default(false),
    allOwnersAdmin: z.boolean().default(false),
});

function ownerScope(req: Request) {
    const auth = (req as AuthRequest).auth;
    return auth?.role === "ADMIN" && !auth.isObserver && auth.ownerIds?.length
        ? { ownerId: { in: auth.ownerIds } }
        : {};
}

/** Aggregate current fleet, live-location, active-trip, and complaint counts. */
export async function getDashboardSummary(req: Request, res: Response) {
    const scope = ownerScope(req);
    try {
        const [totalRickshaws, onlineDrivers, activeTrips, openComplaints] =
            await Promise.all([
                prisma.rickshaw.count({ where: scope }),
                prisma.driverLocation.count({
                    where: {
                        ...(scope.ownerId ? { driver: { rickshaw: { is: { ownerId: scope.ownerId } } } } : {}),
                        source: "LIVE",
                        updatedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
                    },
                }),
                prisma.trip.count({
                    where: {
                        status: { in: ["REQUESTED", "ACCEPTED", "IN_PROGRESS"] },
                        ...(scope.ownerId ? { rickshaw: { is: { ownerId: scope.ownerId } } } : {}),
                    },
                }),
                prisma.complaint.count({
                    where: {
                        status: "OPEN",
                        ...(scope.ownerId
                            ? { trip: { is: { rickshaw: { is: { ownerId: scope.ownerId } } } } }
                            : {}),
                    },
                }),
            ]);
        const auth = (req as AuthRequest).auth;
        return res.json({
            totalRickshaws,
            onlineDrivers,
            activeTrips,
            openComplaints,
            isObserver: auth?.role === "ADMIN" && auth.isObserver === true,
        });
    } catch (error) {
        console.error("Load admin dashboard summary error:", error);
        return res.status(500).json({ message: "Could not load dashboard summary" });
    }
}

/** List approved owners and active delegated admin accounts for access management. */
export async function listAssignableOwners(_req: Request, res: Response) {
    try {
        const [owners, administrators] = await Promise.all([
            prisma.owner.findMany({
            where: { user: { approvalStatus: "APPROVED" } },
            select: {
                id: true,
                user: { select: { name: true, email: true, phone: true } },
            },
            orderBy: { user: { name: "asc" } },
            take: 500,
            }),
            prisma.user.findMany({
                where: { role: "ADMIN" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    adminAssignments: {
                        select: {
                            ownerId: true,
                            isObserver: true,
                            owner: { select: { user: { select: { name: true } } } },
                        },
                    },
                },
                orderBy: { name: "asc" },
                take: 200,
            }),
        ]);
        return res.json({ owners, administrators });
    } catch (error) {
        console.error("List admin-assignable owners error:", error);
        return res.status(500).json({ message: "Could not load owners" });
    }
}

/** Create an approved admin with selected-owner, global admin, or observer access. */
export async function createScopedAdmin(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    const parsed = createAdminSchema.safeParse(req.body);
    if (!auth || !parsed.success) {
        return res.status(400).json({
            message: "Provide valid admin details and either selected owners or observer access",
        });
    }
    if (
        Number(parsed.data.allOwnersObserver) +
            Number(parsed.data.allOwnersAdmin) +
            Number(parsed.data.ownerIds.length > 0) !== 1
    ) {
        return res.status(400).json({
            message: "Choose specific owners, all-owner admin access, or all-owner observer access",
        });
    }
    const phone = normalizeBangladeshPhone(parsed.data.phone);
    if (!phone) {
        return res.status(400).json({ message: "Enter a valid Bangladesh mobile number" });
    }

    try {
        const allOwnersAccess = parsed.data.allOwnersObserver || parsed.data.allOwnersAdmin;
        const owners = allOwnersAccess
            ? []
            : await prisma.owner.findMany({
                where: {
                    id: { in: parsed.data.ownerIds },
                    user: { approvalStatus: "APPROVED" },
                },
                select: { id: true },
            });
        if (!allOwnersAccess && owners.length !== new Set(parsed.data.ownerIds).size) {
            return res.status(404).json({ message: "One or more approved owners were not found" });
        }

        const admin = await prisma.user.create({
            data: {
                name: parsed.data.name,
                email: parsed.data.email.toLowerCase(),
                phone,
                password: await bcrypt.hash(parsed.data.password, 12),
                role: "ADMIN",
                approvalStatus: "APPROVED",
                adminAssignments: {
                    create: parsed.data.allOwnersObserver || parsed.data.allOwnersAdmin
                        ? [{ isObserver: parsed.data.allOwnersObserver, createdById: auth.userId }]
                        : owners.map((owner) => ({ ownerId: owner.id, createdById: auth.userId })),
                },
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                adminAssignments: { select: { ownerId: true, isObserver: true } },
            },
        });
        return res.status(201).json({ admin });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return res.status(409).json({ message: "That email or phone is already registered" });
        }
        console.error("Create scoped admin error:", error);
        return res.status(500).json({ message: "Could not create admin account" });
    }
}

/** Replace an admin's owner grants or change global access mode. */
export async function updateAdminAssignments(req: Request, res: Response) {
    const parsed = z.object({
        ownerIds: z.array(z.string().trim().min(1)).max(100),
        allOwnersObserver: z.boolean(),
        allOwnersAdmin: z.boolean(),
    }).safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Choose owners or all-owner observer access" });
    }
    if (
        Number(parsed.data.allOwnersObserver) +
            Number(parsed.data.allOwnersAdmin) +
            Number(parsed.data.ownerIds.length > 0) !== 1
    ) {
        return res.status(400).json({
            message: "Choose specific owners, all-owner admin access, or all-owner observer access",
        });
    }
    const adminId = typeof req.params.adminId === "string" ? req.params.adminId : "";
    if (!adminId) return res.status(400).json({ message: "An admin ID is required" });
    try {
        const admin = await prisma.user.findFirst({
            where: { id: adminId, role: "ADMIN" },
            select: { id: true },
        });
        if (!admin) return res.status(404).json({ message: "Admin account not found" });

        const allOwnersAccess = parsed.data.allOwnersObserver || parsed.data.allOwnersAdmin;
        const owners = allOwnersAccess
            ? []
            : await prisma.owner.findMany({
                where: {
                    id: { in: parsed.data.ownerIds },
                    user: { approvalStatus: "APPROVED" },
                },
                select: { id: true },
            });
        if (!allOwnersAccess && owners.length !== new Set(parsed.data.ownerIds).size) {
            return res.status(404).json({ message: "One or more approved owners were not found" });
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.adminAssignment.deleteMany({ where: { adminId } });
            await transaction.adminAssignment.createMany({
                data: parsed.data.allOwnersObserver || parsed.data.allOwnersAdmin
                    ? [{ adminId, isObserver: parsed.data.allOwnersObserver }]
                    : owners.map((owner) => ({ adminId, ownerId: owner.id })),
            });
        });
        return res.json({ message: "Admin access updated" });
    } catch (error) {
        console.error("Update admin assignments error:", error);
        return res.status(500).json({ message: "Could not update admin access" });
    }
}

/** List pending public driver and owner registrations for administrative review. */
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
            take: 100,
        });
        return res.json({ approvals });
    } catch (error) {
        console.error("Load pending approvals error:", error);
        return res.status(500).json({ message: "Could not load pending approvals" });
    }
}

/** Approve or reject a still-pending driver or owner account. */
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

function managedAccountWhere(req: Request): Prisma.UserWhereInput {
    const auth = (req as AuthRequest).auth;
    if (auth?.role !== "ADMIN" || auth.allOwnersAccess) {
        return { role: { in: ["DRIVER", "OWNER"] } };
    }
    const ownerIds = auth.ownerIds ?? [];
    return {
        OR: [
            { role: "OWNER", owner: { is: { id: { in: ownerIds } } } },
            { role: "DRIVER", driver: { is: { rickshaw: { is: { ownerId: { in: ownerIds } } } } } },
        ],
    };
}

/** List approved owners and drivers this admin is allowed to manage. */
export async function listManagedAccounts(req: Request, res: Response) {
    try {
        const accounts = await prisma.user.findMany({
            where: {
                ...managedAccountWhere(req),
                approvalStatus: "APPROVED",
            },
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                role: true,
                isRestricted: true,
                owner: { select: { id: true } },
                driver: {
                    select: {
                        rickshaw: {
                            select: {
                                id: true,
                                plateNo: true,
                                owner: { select: { user: { select: { name: true } } } },
                            },
                        },
                    },
                },
            },
            orderBy: [{ role: "asc" }, { name: "asc" }],
            take: 500,
        });
        return res.json({ accounts });
    } catch (error) {
        console.error("Load manageable accounts error:", error);
        return res.status(500).json({ message: "Could not load manageable accounts" });
    }
}

/** Restrict or restore an approved driver/owner after checking the caller's owner scope. */
export async function updateAccountRestriction(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    const parsed = z.object({ isRestricted: z.boolean() }).safeParse(req.body);
    const userId = typeof req.params.userId === "string" ? req.params.userId : "";
    if (!auth || !userId || !parsed.success) {
        return res.status(400).json({ message: "A valid account and restriction status are required" });
    }
    try {
        const result = await prisma.user.updateMany({
            where: {
                id: userId,
                ...managedAccountWhere(req),
                approvalStatus: "APPROVED",
            },
            data: { isRestricted: parsed.data.isRestricted },
        });
        if (result.count === 0) {
            return res.status(404).json({ message: "Manageable approved driver or owner not found" });
        }
        return res.json({
            message: parsed.data.isRestricted ? "Account restricted" : "Account access restored",
        });
    } catch (error) {
        console.error("Update account restriction error:", error);
        return res.status(500).json({ message: "Could not update account restriction" });
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

/** Search related records and shape them into the admin UI's common result format. */
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
        const scope = ownerScope(req);
        const scopedUserFilter = scope.ownerId
            ? {
                OR: [
                    { owner: { is: { id: scope.ownerId } } },
                    { driver: { is: { rickshaw: { is: { ownerId: scope.ownerId } } } } },
                ],
            }
            : {};
        const userFilters = textFilter(query);
        const phoneFilters = phoneRelationFilter(query);
        const results: SearchResult[] = [];

        if (searchAll || selectedType === "drivers" || selectedType === "owners") {
            const users = await prisma.user.findMany({
                where: {
                    AND: [
                        ...(selectedType === "drivers" ? [{ driver: { isNot: null } }] : []),
                        ...(selectedType === "owners" ? [{ owner: { isNot: null } }] : []),
                        { OR: userFilters },
                        ...(scope.ownerId ? [scopedUserFilter] : []),
                    ],
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
                    ...scope,
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
                        AND: [
                            ...(scope.ownerId ? [{ rickshaw: { is: { ownerId: scope.ownerId } } }] : []),
                            { OR: [
                            { pickupLocation: { contains: query, mode: "insensitive" } },
                            { dropoffLocation: { contains: query, mode: "insensitive" } },
                            { passenger: { OR: userFilters } },
                            { driver: { OR: userFilters } },
                            { rickshaw: { plateNo: { contains: query, mode: "insensitive" } } },
                            ] },
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
                        AND: [
                            ...(scope.ownerId ? [{ driver: { rickshaw: { is: { ownerId: scope.ownerId } } } }] : []),
                            { OR: [
                            { driver: { user: { OR: [...userFilters, ...phoneFilters] } } },
                            { driver: { rickshaw: { plateNo: { contains: query, mode: "insensitive" } } } },
                            ] },
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
                    AND: [
                        ...(scope.ownerId ? [{ trip: { is: { rickshaw: { is: { ownerId: scope.ownerId } } } } }] : []),
                        { OR: [
                        { user: { OR: [...userFilters, ...phoneFilters] } },
                        { trip: { pickupLocation: { contains: query, mode: "insensitive" } } },
                        { trip: { dropoffLocation: { contains: query, mode: "insensitive" } } },
                        { trip: { rickshaw: { plateNo: { contains: query, mode: "insensitive" } } } },
                        ] },
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
                    AND: [
                        ...(scope.ownerId ? [{ trip: { is: { rickshaw: { is: { ownerId: scope.ownerId } } } } }] : []),
                        { OR: [
                        { subject: { contains: query, mode: "insensitive" } },
                        { description: { contains: query, mode: "insensitive" } },
                        { user: { OR: userFilters } },
                        { user: { OR: phoneFilters } },
                        ] },
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

        if (searchAll || selectedType === "location") {
            const locationProfiles = await prisma.userProfile.findMany({
                where: {
                    AND: [
                        { OR: [
                            { division: { contains: query, mode: "insensitive" } },
                            { district: { contains: query, mode: "insensitive" } },
                            { upazila: { contains: query, mode: "insensitive" } },
                            { unionWard: { contains: query, mode: "insensitive" } },
                            { villageRoad: { contains: query, mode: "insensitive" } },
                            { postalCode: { contains: query, mode: "insensitive" } },
                        ] },
                        ...(scope.ownerId
                            ? [{
                                user: {
                                    OR: [
                                        { owner: { is: { id: scope.ownerId } } },
                                        { driver: { is: { rickshaw: { is: { ownerId: scope.ownerId } } } } },
                                    ],
                                },
                            }]
                            : []),
                    ],
                },
                select: {
                    userId: true,
                    division: true,
                    district: true,
                    upazila: true,
                    unionWard: true,
                    villageRoad: true,
                    postalCode: true,
                    user: { select: { name: true } },
                },
                orderBy: [
                    { division: "asc" },
                    { district: "asc" },
                    { upazila: "asc" },
                ],
                take: 50,
            });
            results.push(...locationProfiles.map<SearchResult>((profile) => ({
                id: profile.userId,
                name: profile.user.name,
                type: "location",
                description: [
                    profile.division,
                    profile.district,
                    profile.upazila,
                    profile.unionWard,
                    profile.villageRoad,
                    profile.postalCode,
                ].filter(Boolean).join(" · "),
            })));
        }

        return res.json({ results: results.slice(0, 50), total: results.length });
    } catch (error) {
        console.error("Admin search error:", error);
        return res.status(500).json({ message: "Search failed" });
    }
}
