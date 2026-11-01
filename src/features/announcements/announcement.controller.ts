import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
type AuthRequest = Request & {
    auth?: {
        userId: string;
        role: string;
        ownerIds?: string[];
        isObserver?: boolean;
        allOwnersAccess?: boolean;
    };
};

const announcementSchema = z.object({
    title: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(2000),
    audience: z.enum(["ADMIN", "OWNER", "DRIVER"]),
    targetUserId: z.string().trim().min(1).nullable(),
    ownerId: z.string().trim().min(1).nullable(),
});

function isOwnerRole(role: string): role is "OWNER" | "DRIVER" {
    return role === "OWNER" || role === "DRIVER";
}

function isAnnouncementAudience(role: string): role is "SUPER_ADMIN" | "ADMIN" | "OWNER" | "DRIVER" {
    return role === "SUPER_ADMIN" || role === "ADMIN" || role === "OWNER" || role === "DRIVER";
}

export async function listNoticeRecipients(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    const parsedRole = z.enum(["ADMIN", "OWNER", "DRIVER"]).safeParse(req.query.role);
    if (!parsedRole.success) {
        return res.status(400).json({ message: "Choose an audience role" });
    }
    if (parsedRole.data === "ADMIN" && auth.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Only a super admin can target admin accounts" });
    }
    if (auth.role === "ADMIN" && auth.isObserver) {
        return res.status(403).json({ message: "Observer admins cannot issue announcements" });
    }

    try {
        const ownerIds = auth.ownerIds ?? [];
        const ownerId = typeof req.query.ownerId === "string" ? req.query.ownerId : undefined;
        if (ownerId && auth.role === "ADMIN" && !auth.allOwnersAccess && !ownerIds.includes(ownerId)) {
            return res.status(403).json({ message: "That owner is outside your assigned scope" });
        }
        const recipients = await prisma.user.findMany({
            where: {
                role: parsedRole.data,
                ...(parsedRole.data === "OWNER"
                    ? {
                        owner: {
                            is: {
                                ...(auth.role === "ADMIN" && !auth.allOwnersAccess
                                    ? { id: { in: ownerIds } }
                                    : {}),
                                ...(ownerId ? { id: ownerId } : {}),
                            },
                        },
                    }
                    : parsedRole.data === "DRIVER"
                        ? {
                            driver: {
                                is: {
                                    rickshaw: {
                                        is: {
                                            ...(auth.role === "ADMIN" && !auth.allOwnersAccess
                                                ? { ownerId: { in: ownerIds } }
                                                : {}),
                                            ...(ownerId ? { ownerId } : {}),
                                        },
                                    },
                                },
                            },
                        }
                        : {}),
            },
            select: { id: true, name: true, phone: true, email: true },
            orderBy: { name: "asc" },
            take: 200,
        });
        return res.json({ recipients });
    } catch (error) {
        console.error("List announcement recipients error:", error);
        return res.status(500).json({ message: "Could not load announcement recipients" });
    }
}

export async function listNoticeOwners(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    if (auth.role === "ADMIN" && auth.isObserver) {
        return res.status(403).json({ message: "Observer admins cannot issue announcements" });
    }
    try {
        const owners = await prisma.owner.findMany({
            where: {
                user: { approvalStatus: "APPROVED" },
                ...(auth.role === "ADMIN" && !auth.allOwnersAccess
                    ? { id: { in: auth.ownerIds ?? [] } }
                    : {}),
            },
            select: { id: true, user: { select: { name: true, phone: true, email: true } } },
            orderBy: { user: { name: "asc" } },
            take: 500,
        });
        return res.json({ owners });
    } catch (error) {
        console.error("List announcement owners error:", error);
        return res.status(500).json({ message: "Could not load announcement owners" });
    }
}

export async function getAnnouncements(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    if (!isAnnouncementAudience(auth.role)) {
        return res.status(403).json({ message: "Unsupported announcement audience" });
    }
    try {
        const ownerIds = auth.ownerIds ?? [];
        const recipientOwnerIds = auth.role === "OWNER"
            ? [(await prisma.owner.findUnique({
                where: { userId: auth.userId },
                select: { id: true },
            }))?.id].filter((id): id is string => Boolean(id))
            : auth.role === "DRIVER"
                ? (await prisma.rickshaw.findMany({
                    where: { driver: { is: { userId: auth.userId } } },
                    select: { ownerId: true },
                })).map((rickshaw) => rickshaw.ownerId)
                : ownerIds;

        const announcements = await prisma.announcement.findMany({
            where: {
                OR: [
                    { targetUserId: auth.userId },
                    {
                        targetUserId: null,
                        audience: auth.role,
                        ...(auth.role === "SUPER_ADMIN"
                            ? { ownerId: null }
                            : {
                                OR: [
                                    { ownerId: null },
                                    ...(recipientOwnerIds.length
                                        ? [{ ownerId: { in: recipientOwnerIds } }]
                                        : []),
                                ],
                            }),
                    },
                ],
            },
            select: {
                id: true,
                title: true,
                message: true,
                audience: true,
                targetUserId: true,
                ownerId: true,
                createdAt: true,
                updatedAt: true,
                createdBy: { select: { name: true, role: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        return res.json({ announcements });
    } catch (error) {
        console.error("Load announcements error:", error);
        return res.status(500).json({ message: "Could not load announcements" });
    }
}

export async function listManagedAnnouncements(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    try {
        const announcements = await prisma.announcement.findMany({
            where: auth.role === "SUPER_ADMIN"
                ? {}
                : auth.role === "ADMIN" && auth.allOwnersAccess
                    ? {}
                : {
                    OR: [
                        { createdById: auth.userId },
                        { ownerId: { in: auth.ownerIds ?? [] } },
                    ],
                },
            select: {
                id: true,
                title: true,
                message: true,
                audience: true,
                targetUserId: true,
                ownerId: true,
                createdById: true,
                createdAt: true,
                updatedAt: true,
                createdBy: { select: { name: true, role: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        return res.json({ announcements });
    } catch (error) {
        console.error("List managed announcements error:", error);
        return res.status(500).json({ message: "Could not load announcements" });
    }
}

async function validateRecipient(
    audience: "ADMIN" | "OWNER" | "DRIVER",
    targetUserId: string,
    auth: NonNullable<AuthRequest["auth"]>,
) {
    const target = await prisma.user.findFirst({
        where: { id: targetUserId, role: audience },
        select: {
            id: true,
            owner: { select: { id: true } },
            driver: { select: { rickshaw: { select: { ownerId: true } } } },
        },
    });
    if (!target) return null;
    if (auth.role === "SUPER_ADMIN" || auth.allOwnersAccess) return target;
    if (!isOwnerRole(audience)) return null;
    const ownerId = audience === "OWNER"
        ? target.owner?.id
        : target.driver?.rickshaw?.ownerId;
    return auth.allOwnersAccess || Boolean(ownerId && auth.ownerIds?.includes(ownerId))
        ? target
        : null;
}

async function saveAnnouncement(req: Request, res: Response, announcementId?: string) {
    const auth = (req as AuthRequest).auth;
    const parsed = announcementSchema.safeParse(req.body);
    if (!auth || !parsed.success) {
        return res.status(400).json({
            message: "Provide a title, message, audience, and valid recipient selection",
            errors: parsed.success ? undefined : parsed.error.flatten(),
        });
    }
    if (auth.role === "ADMIN" && !isOwnerRole(parsed.data.audience)) {
        return res.status(403).json({ message: "Scoped admins can only message owners and drivers" });
    }

    try {
        let ownerId = parsed.data.ownerId;
        if (auth.role === "ADMIN") {
            const allowedOwnerIds = auth.ownerIds ?? [];
            if (ownerId && !auth.allOwnersAccess && !allowedOwnerIds.includes(ownerId)) {
                return res.status(403).json({ message: "That owner is outside your assigned scope" });
            }
            if (!ownerId && allowedOwnerIds.length === 1) ownerId = allowedOwnerIds[0] ?? null;
            if (!ownerId && !auth.allOwnersAccess) {
                return res.status(400).json({ message: "Choose an owner for this announcement" });
            }
        }

        if (ownerId && isOwnerRole(parsed.data.audience)) {
            const owner = await prisma.owner.findUnique({
                where: { id: ownerId },
                select: { id: true },
            });
            if (!owner) return res.status(404).json({ message: "Owner not found" });
        }

        if (parsed.data.targetUserId) {
            const target = await validateRecipient(
                parsed.data.audience,
                parsed.data.targetUserId,
                auth,
            );
            if (!target) {
                return res.status(404).json({ message: "Recipient not found in your permitted scope" });
            }
            if (ownerId && isOwnerRole(parsed.data.audience)) {
                const recipientOwnerId = parsed.data.audience === "OWNER"
                    ? target.owner?.id
                    : target.driver?.rickshaw?.ownerId;
                if (recipientOwnerId !== ownerId) {
                    return res.status(400).json({ message: "Recipient does not belong to the selected owner" });
                }
            }
        }

        if (announcementId) {
            const existing = await prisma.announcement.findUnique({
                where: { id: announcementId },
                select: { id: true, createdById: true, ownerId: true },
            });
            if (!existing) return res.status(404).json({ message: "Announcement not found" });
            if (
                auth.role !== "SUPER_ADMIN" &&
                (existing.createdById !== auth.userId ||
                    (existing.ownerId
                        ? !auth.allOwnersAccess && !auth.ownerIds?.includes(existing.ownerId)
                        : !auth.allOwnersAccess))
            ) {
                return res.status(404).json({ message: "Announcement not found" });
            }
        }

        const data = {
            title: parsed.data.title,
            message: parsed.data.message,
            audience: parsed.data.audience,
            targetUserId: parsed.data.targetUserId,
            ownerId,
        };
        const announcement = announcementId
            ? await prisma.announcement.update({ where: { id: announcementId }, data })
            : await prisma.announcement.create({
                data: { ...data, createdById: auth.userId },
                select: { id: true },
            });
        return res.status(announcementId ? 200 : 201).json({
            message: announcementId ? "Announcement updated" : "Announcement published",
            announcement,
        });
    } catch (error) {
        console.error("Save announcement error:", error);
        return res.status(500).json({ message: "Could not save announcement" });
    }
}

export async function publishAnnouncement(req: Request, res: Response) {
    return saveAnnouncement(req, res);
}

export async function updateAnnouncement(req: Request, res: Response) {
    return saveAnnouncement(req, res, req.params.announcementId as string);
}

export async function removeAnnouncement(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    try {
        const result = await prisma.announcement.deleteMany({
            where: {
                id: req.params.announcementId as string,
                ...(auth.role === "SUPER_ADMIN"
                    ? {}
                    : {
                        createdById: auth.userId,
                        ...(auth.allOwnersAccess ? {} : { ownerId: { in: auth.ownerIds ?? [] } }),
                    }),
            },
        });
        if (result.count === 0) return res.status(404).json({ message: "Announcement not found" });
        return res.json({ message: "Announcement removed" });
    } catch (error) {
        console.error("Remove announcement error:", error);
        return res.status(500).json({ message: "Could not remove announcement" });
    }
}
