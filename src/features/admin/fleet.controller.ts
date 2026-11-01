import type { Request, Response } from "express";
import { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { role: string; ownerIds?: string[]; allOwnersAccess?: boolean } };

const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    search: z.string().trim().max(100).default(""),
    status: z.string().trim().optional(),
});

function parseListQuery(req: Request, statuses: readonly string[]) {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return { error: "Provide a valid page, page size, search, and status filter" } as const;
    if (parsed.data.status && !statuses.includes(parsed.data.status)) {
        return { error: "Choose a valid status filter" } as const;
    }
    return { data: parsed.data } as const;
}

/** Search and page only the requested vehicle records within the caller's admin scope. */
export async function listAdminFleetVehicles(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    const parsed = parseListQuery(req, ["ACTIVE", "INACTIVE", "MAINTENANCE"]);
    if (!parsed.data) return res.status(400).json({ message: parsed.error });
    const { page, pageSize, search, status } = parsed.data;
    const where: Prisma.RickshawWhereInput = {
        ...(auth.role === "ADMIN" && !auth.allOwnersAccess
            ? { ownerId: { in: auth.ownerIds ?? [] } }
            : {}),
        ...(status ? { status: status as "ACTIVE" | "INACTIVE" | "MAINTENANCE" } : {}),
        ...(search
            ? {
                OR: [
                    { plateNo: { contains: search, mode: "insensitive" } },
                    { owner: { user: { name: { contains: search, mode: "insensitive" } } } },
                    { driver: { is: { user: { name: { contains: search, mode: "insensitive" } } } } },
                ],
            }
            : {}),
    };
    try {
        const [total, vehicles] = await Promise.all([
            prisma.rickshaw.count({ where }),
            prisma.rickshaw.findMany({
                where,
                select: {
                    id: true,
                    plateNo: true,
                    model: true,
                    status: true,
                    driver: { select: { user: { select: { name: true, phone: true } } } },
                    owner: { select: { user: { select: { name: true } } } },
                },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        return res.json({ items: vehicles, total, page, pageSize });
    } catch (error) {
        console.error("List admin fleet vehicles error:", error);
        return res.status(500).json({ message: "Could not load fleet vehicles" });
    }
}

/** Search and page drivers by name/contact/vehicle within assigned owner scope. */
export async function listAdminFleetDrivers(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    const parsed = parseListQuery(req, ["ONLINE", "OFFLINE", "ON_TRIP"]);
    if (!parsed.data) return res.status(400).json({ message: parsed.error });
    const { page, pageSize, search, status } = parsed.data;
    const where: Prisma.DriverWhereInput = {
        ...(auth.role === "ADMIN" && !auth.allOwnersAccess
            ? { rickshaw: { is: { ownerId: { in: auth.ownerIds ?? [] } } } }
            : {}),
        ...(status ? { status: status as "ONLINE" | "OFFLINE" | "ON_TRIP" } : {}),
        ...(search
            ? {
                OR: [
                    { user: { name: { contains: search, mode: "insensitive" } } },
                    { user: { phone: { contains: search } } },
                    { user: { email: { contains: search, mode: "insensitive" } } },
                    { rickshaw: { is: { plateNo: { contains: search, mode: "insensitive" } } } },
                ],
            }
            : {}),
    };
    try {
        const [total, drivers] = await Promise.all([
            prisma.driver.count({ where }),
            prisma.driver.findMany({
                where,
                select: {
                    id: true,
                    status: true,
                    user: {
                        select: {
                            name: true,
                            phone: true,
                            email: true,
                            approvalStatus: true,
                        },
                    },
                    rickshaw: { select: { plateNo: true } },
                },
                orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        return res.json({ items: drivers, total, page, pageSize });
    } catch (error) {
        console.error("List admin fleet drivers error:", error);
        return res.status(500).json({ message: "Could not load fleet drivers" });
    }
}
