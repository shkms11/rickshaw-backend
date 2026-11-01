import { PrismaClient } from "../../generated/prisma/client.js";
import { normalizeBangladeshPhone } from "../../shared/phone.js";
import type { AiIdentity, AiProposedAction } from "./ai.service.js";
import { z } from "zod";

const prisma = new PrismaClient();

export class AiActionError extends Error {}

type StoredAnnouncement = {
    title: string;
    message: string;
    audience: "SUPER_ADMIN" | "ADMIN" | "OWNER" | "DRIVER";
    ownerId: string | null;
    targetUserId: string | null;
};
const announcementSnapshotSchema = z.object({
    title: z.string(),
    message: z.string(),
    audience: z.enum(["SUPER_ADMIN", "ADMIN", "OWNER", "DRIVER"]),
    ownerId: z.string().nullable(),
    targetUserId: z.string().nullable(),
});
const statusSnapshotSchema = z.object({ status: z.string() });

async function assertCanWrite(identity: AiIdentity): Promise<AiIdentity> {
    const user = await prisma.user.findUnique({
        where: { id: identity.userId },
        select: { role: true },
    });
    if (!user || user.role !== identity.role) {
        throw new AiActionError("Your account permissions changed. Sign in again before making changes.");
    }
    if (identity.role === "SUPER_ADMIN") return identity;
    if (identity.role !== "ADMIN") {
        throw new AiActionError("Your role cannot make this change.");
    }
    const assignments = await prisma.adminAssignment.findMany({
        where: { adminId: identity.userId },
        select: { ownerId: true, isObserver: true },
    });
    const allOwnersAccess = assignments.some(
        (assignment) => assignment.ownerId === null && !assignment.isObserver,
    );
    const ownerIds = assignments.flatMap((assignment) =>
        assignment.ownerId ? [assignment.ownerId] : [],
    );
    if (assignments.some((assignment) => assignment.isObserver) && !allOwnersAccess) {
        throw new AiActionError("Observer or unassigned admins cannot make changes.");
    }
    if (!ownerIds.length && !allOwnersAccess) {
        throw new AiActionError("Observer or unassigned admins cannot make changes.");
    }
    return { ...identity, ownerIds, isObserver: false, allOwnersAccess };
}

function parseStatus<const Choices extends readonly string[]>(
    value: unknown,
    choices: Choices,
): Choices[number] | null {
    return typeof value === "string" && choices.includes(value) ? value : null;
}

async function saveAnnouncementAction(
    identity: AiIdentity,
    proposalId: string,
    action: Extract<AiProposedAction, { kind: "create_announcement" | "update_announcement" }>,
) {
    identity = await assertCanWrite(identity);
    if (action.kind === "create_announcement") {
        if (action.audience === "ADMIN" && identity.role !== "SUPER_ADMIN") {
            throw new AiActionError("Only a superadmin can send updates to admins.");
        }
        if (action.audience === "ADMIN" && (action.ownerQuery || action.allOwners)) {
            throw new AiActionError("Admin announcements do not use an owner scope.");
        }
        if (
            identity.role === "ADMIN" &&
            identity.allOwnersAccess &&
            action.audience !== "ADMIN" &&
            !action.ownerQuery &&
            !action.recipientQuery &&
            !action.allOwners
        ) {
            throw new AiActionError("Choose one owner or explicitly request all owners.");
        }
        if (action.allOwners && action.recipientQuery) {
            throw new AiActionError("Choose either a direct recipient or all owners, not both.");
        }
        let ownerId: string | null = null;
        let targetUserId: string | null = null;
        if (action.audience !== "ADMIN") {
            if (identity.role === "ADMIN" && action.allOwners && !identity.allOwnersAccess) {
                throw new AiActionError("Admin updates must stay within assigned owners.");
            }
            if (
                identity.role === "ADMIN" &&
                !action.ownerQuery &&
                !action.recipientQuery &&
                !action.allOwners &&
                identity.ownerIds?.length !== 1
            ) {
                throw new AiActionError("Name one of your assigned owners for this update.");
            }
            if (identity.role === "SUPER_ADMIN" && !action.ownerQuery &&
                !action.recipientQuery && !action.allOwners) {
                throw new AiActionError("Choose an owner or explicitly request all owners.");
            }
            if (action.ownerQuery) {
                const owners = await prisma.owner.findMany({
                    where: {
                        user: { name: { equals: action.ownerQuery, mode: "insensitive" } },
                        ...(identity.role === "ADMIN" && !identity.allOwnersAccess
                            ? { id: { in: identity.ownerIds ?? [] } }
                            : {}),
                    },
                    select: { id: true },
                    take: 2,
                });
                if (owners.length !== 1) {
                    throw new AiActionError(owners.length
                        ? "More than one owner matches. Please specify the owner more clearly."
                        : "That owner is not available in your assigned scope.");
                }
                ownerId = owners[0]?.id ?? null;
            } else if (identity.role === "ADMIN" && !identity.allOwnersAccess && !action.recipientQuery) {
                ownerId = identity.ownerIds?.[0] ?? null;
            }
        }

        if (action.recipientQuery) {
            const recipients = await prisma.user.findMany({
                where: {
                    role: action.audience,
                    name: { equals: action.recipientQuery, mode: "insensitive" },
                    ...(action.audience === "OWNER"
                        ? {
                            owner: {
                                is: {
                                    ...(ownerId ? { id: ownerId } : {}),
                                    ...(identity.role === "ADMIN" && !identity.allOwnersAccess
                                        ? { id: { in: identity.ownerIds ?? [] } }
                                        : {}),
                                },
                            },
                        }
                        : action.audience === "DRIVER"
                            ? {
                                driver: {
                                    is: {
                                        rickshaw: {
                                            is: {
                                                ...(ownerId ? { ownerId } : {}),
                                                ...(identity.role === "ADMIN" && !identity.allOwnersAccess
                                                    ? { ownerId: { in: identity.ownerIds ?? [] } }
                                                    : {}),
                                            },
                                        },
                                    },
                                },
                            }
                            : {}),
                },
                select: {
                    id: true,
                    owner: { select: { id: true } },
                    driver: { select: { rickshaw: { select: { ownerId: true } } } },
                },
                take: 2,
            });
            if (recipients.length !== 1 || !recipients[0]) {
                throw new AiActionError(recipients.length
                    ? "Several people match that name. Ask for a more specific name."
                    : "That person is not available in your permitted scope.");
            }
            const recipient = recipients[0];
            targetUserId = recipient.id;
            const recipientOwnerId = action.audience === "OWNER"
                ? recipient.owner?.id ?? null
                : action.audience === "DRIVER"
                    ? recipient.driver?.rickshaw?.ownerId ?? null
                    : null;
            if (ownerId && recipientOwnerId !== ownerId) {
                throw new AiActionError("The direct recipient does not belong to the selected owner.");
            }
            if (identity.role === "ADMIN" && action.audience !== "ADMIN" && !recipientOwnerId) {
                throw new AiActionError("This recipient is not assigned to one of your owners.");
            }
            if (!ownerId) ownerId = recipientOwnerId;
        }
        return prisma.$transaction(async (transaction) => {
            const announcement = await transaction.announcement.create({
                data: {
                    title: action.title,
                    message: action.message,
                    audience: action.audience,
                    ownerId,
                    targetUserId,
                    createdById: identity.userId,
                },
                select: {
                    id: true,
                    title: true,
                    message: true,
                    audience: true,
                    ownerId: true,
                    targetUserId: true,
                },
            });
            const log = await transaction.aiActionLog.create({
                data: {
                    proposalId,
                    userId: identity.userId,
                    type: "ANNOUNCEMENT_CREATE",
                    targetId: announcement.id,
                    afterData: {
                        title: announcement.title,
                        message: announcement.message,
                        audience: announcement.audience,
                        ownerId: announcement.ownerId,
                        targetUserId: announcement.targetUserId,
                    },
                },
            });
            return { actionId: log.id, targetId: announcement.id, message: "Announcement created." };
        });
    }

    const managedWhere = {
        title: { equals: action.existingTitle, mode: "insensitive" as const },
        ...(identity.role === "ADMIN"
            ? {
                createdById: identity.userId,
                ...(identity.allOwnersAccess ? {} : { ownerId: { in: identity.ownerIds ?? [] } }),
            }
            : {}),
    };
    const matches = await prisma.announcement.findMany({
        where: managedWhere,
        select: {
            id: true,
            title: true,
            message: true,
            audience: true,
            ownerId: true,
            targetUserId: true,
        },
        take: 2,
    });
    if (matches.length !== 1 || !matches[0]) {
        throw new AiActionError(matches.length
            ? "Several updates have that title. Please use a more specific title."
            : "No update with that title is available to edit.");
    }
    const current = matches[0];
    const before: StoredAnnouncement = {
        title: current.title,
        message: current.message,
        audience: current.audience,
        ownerId: current.ownerId,
        targetUserId: current.targetUserId,
    };
    const after: StoredAnnouncement = {
        ...before,
        ...(action.title ? { title: action.title } : {}),
        ...(action.message ? { message: action.message } : {}),
    };
    return prisma.$transaction(async (transaction) => {
        const updated = await transaction.announcement.updateMany({
            where: {
                id: current.id,
                title: current.title,
                message: current.message,
                audience: current.audience,
                ownerId: current.ownerId,
                targetUserId: current.targetUserId,
            },
            data: { title: after.title, message: after.message },
        });
        if (updated.count !== 1) throw new AiActionError("This update changed before the AI could edit it. Try again.");
        const log = await transaction.aiActionLog.create({
            data: {
                proposalId,
                userId: identity.userId,
                type: "ANNOUNCEMENT_UPDATE",
                targetId: current.id,
                beforeData: before,
                afterData: after,
            },
        });
        return { actionId: log.id, targetId: current.id, message: "Announcement updated." };
    });
}

async function saveRickshawStatusAction(
    identity: AiIdentity,
    proposalId: string,
    action: Extract<AiProposedAction, { kind: "set_rickshaw_status" }>,
) {
    identity = await assertCanWrite(identity);
    return prisma.$transaction(async (transaction) => {
        const rickshaw = await transaction.rickshaw.findFirst({
            where: {
                plateNo: { equals: action.plateNo, mode: "insensitive" },
                ...(identity.role === "ADMIN" && !identity.allOwnersAccess
                    ? { ownerId: { in: identity.ownerIds ?? [] } }
                    : {}),
            },
            select: { id: true, status: true, driverId: true },
        });
        if (!rickshaw) throw new AiActionError("That rickshaw is not available in your permitted scope.");
        if (rickshaw.status === action.status) throw new AiActionError("The rickshaw already has that status.");
        if (action.status !== "ACTIVE") {
            const activeTrip = await transaction.trip.findFirst({
                where: {
                    rickshawId: rickshaw.id,
                    status: { in: ["REQUESTED", "ACCEPTED", "IN_PROGRESS"] },
                },
                select: { id: true },
            });
            if (activeTrip) throw new AiActionError("A rickshaw with an active trip cannot be set inactive or under maintenance.");
        }
        const nextDriverId = action.status === "INACTIVE" ? null : rickshaw.driverId;
        const updated = await transaction.rickshaw.updateMany({
            where: { id: rickshaw.id, status: rickshaw.status },
            data: { status: action.status, driverId: nextDriverId },
        });
        if (updated.count !== 1) throw new AiActionError("The rickshaw status changed. Review it and try again.");
        const log = await transaction.aiActionLog.create({
            data: {
                proposalId,
                userId: identity.userId,
                type: "RICKSHAW_STATUS",
                targetId: rickshaw.id,
                beforeData: { status: rickshaw.status, driverId: rickshaw.driverId },
                afterData: { status: action.status, driverId: nextDriverId },
            },
        });
        return { actionId: log.id, targetId: rickshaw.id, message: "Rickshaw status updated." };
    });
}

async function saveDriverStatusAction(
    identity: AiIdentity,
    proposalId: string,
    action: Extract<AiProposedAction, { kind: "set_driver_status" }>,
) {
    identity = await assertCanWrite(identity);
    const phone = normalizeBangladeshPhone(action.phone);
    if (!phone) throw new AiActionError("Use a valid Bangladesh driver phone number to identify the driver.");
    return prisma.$transaction(async (transaction) => {
        const driver = await transaction.driver.findFirst({
            where: {
                user: { is: { phone, role: "DRIVER" } },
                ...(identity.role === "ADMIN" && !identity.allOwnersAccess
                    ? { rickshaw: { is: { ownerId: { in: identity.ownerIds ?? [] } } } }
                    : {}),
            },
            select: { id: true, status: true },
        });
        if (!driver) throw new AiActionError("That driver is not available in your permitted scope.");
        if (driver.status === action.status) throw new AiActionError("The driver already has that status.");
        if (action.status === "ONLINE") {
            const liveLocation = await transaction.driverLocation.findFirst({
                where: {
                    driverId: driver.id,
                    source: "LIVE",
                    updatedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
                },
                select: { id: true },
            });
            if (!liveLocation) {
                throw new AiActionError("The driver must share GPS before being marked online.");
            }
        }
        const updated = await transaction.driver.updateMany({
            where: { id: driver.id, status: driver.status },
            data: { status: action.status },
        });
        if (updated.count !== 1) throw new AiActionError("The driver status changed. Review it and try again.");
        const log = await transaction.aiActionLog.create({
            data: {
                proposalId,
                userId: identity.userId,
                type: "DRIVER_STATUS",
                targetId: driver.id,
                beforeData: { status: driver.status },
                afterData: { status: action.status },
            },
        });
        return { actionId: log.id, targetId: driver.id, message: "Driver status updated." };
    });
}

export async function executeAiAction(
    identity: AiIdentity,
    proposalId: string,
    action: AiProposedAction,
) {
    if (action.kind === "create_announcement" || action.kind === "update_announcement") {
        return saveAnnouncementAction(identity, proposalId, action);
    }
    if (action.kind === "set_rickshaw_status") {
        return saveRickshawStatusAction(identity, proposalId, action);
    }
    return saveDriverStatusAction(identity, proposalId, action);
}

export async function findConfirmedAiAction(proposalId: string, userId: string) {
    const action = await prisma.aiActionLog.findUnique({
        where: { proposalId },
        select: { id: true, userId: true, targetId: true },
    });
    if (!action) return null;
    if (action.userId !== userId) {
        throw new AiActionError("This proposal belongs to another account.");
    }
    return {
        actionId: action.id,
        targetId: action.targetId,
        message: "This proposal was already applied.",
    };
}

export async function undoAiAction(identity: AiIdentity, actionId: string) {
    identity = await assertCanWrite(identity);
    const action = await prisma.aiActionLog.findFirst({
        where: { id: actionId, userId: identity.userId, undoneAt: null },
    });
    if (!action) throw new AiActionError("No undoable AI action was found for this account.");

    return prisma.$transaction(async (transaction) => {
        if (action.type === "ANNOUNCEMENT_CREATE") {
            const after = announcementSnapshotSchema.parse(action.afterData);
            const deleted = await transaction.announcement.deleteMany({
                where: {
                    id: action.targetId,
                    createdById: identity.userId,
                    title: after.title,
                    message: after.message,
                    audience: after.audience,
                    ownerId: after.ownerId,
                    targetUserId: after.targetUserId,
                },
            });
            if (deleted.count !== 1) {
                throw new AiActionError("This announcement changed after the AI action, so it was not removed.");
            }
        } else if (action.type === "ANNOUNCEMENT_UPDATE") {
            const beforeParsed = announcementSnapshotSchema.safeParse(action.beforeData);
            const afterParsed = announcementSnapshotSchema.safeParse(action.afterData);
            if (!beforeParsed.success || !afterParsed.success) {
                throw new AiActionError("The original announcement snapshot is unavailable.");
            }
            const before = beforeParsed.data;
            const after = afterParsed.data;
            const restored = await transaction.announcement.updateMany({
                where: {
                    id: action.targetId,
                    title: after.title,
                    message: after.message,
                    audience: after.audience,
                    ownerId: after.ownerId,
                    targetUserId: after.targetUserId,
                },
                data: {
                    title: before.title,
                    message: before.message,
                    audience: before.audience,
                    ownerId: before.ownerId,
                    targetUserId: before.targetUserId,
                },
            });
            if (restored.count !== 1) {
                throw new AiActionError("This announcement changed after the AI action, so it was not reverted.");
            }
        } else if (action.type === "RICKSHAW_STATUS") {
            const rickshawSnapshotSchema = statusSnapshotSchema.extend({ driverId: z.string().nullable() });
            const before = rickshawSnapshotSchema.safeParse(action.beforeData);
            const after = rickshawSnapshotSchema.safeParse(action.afterData);
            if (!before.success || !after.success) {
                throw new AiActionError("The original status snapshot is invalid.");
            }
            const previousStatus = parseStatus(before.data.status, ["ACTIVE", "INACTIVE", "MAINTENANCE"]);
            const currentStatus = parseStatus(after.data.status, ["ACTIVE", "INACTIVE", "MAINTENANCE"]);
            if (!previousStatus || !currentStatus) throw new AiActionError("The original status snapshot is invalid.");
            if (before.data.driverId) {
                const assignment = await transaction.rickshaw.findFirst({
                    where: {
                        driverId: before.data.driverId,
                        id: { not: action.targetId },
                    },
                    select: { id: true },
                });
                if (assignment) {
                    throw new AiActionError("The former driver has since been assigned to another rickshaw, so this action cannot restore the old assignment.");
                }
            }
            const restored = await transaction.rickshaw.updateMany({
                where: {
                    id: action.targetId,
                    status: currentStatus,
                    driverId: after.data.driverId,
                    ...(identity.role === "ADMIN" && !identity.allOwnersAccess
                        ? { ownerId: { in: identity.ownerIds ?? [] } }
                        : {}),
                },
                data: {
                    status: previousStatus,
                    driverId: before.data.driverId,
                },
            });
            if (restored.count !== 1) {
                throw new AiActionError("This rickshaw changed or is outside your access now, so it was not reverted.");
            }
        } else {
            const before = statusSnapshotSchema.safeParse(action.beforeData);
            const after = statusSnapshotSchema.safeParse(action.afterData);
            const previousStatus = before.success && parseStatus(before.data.status, ["ONLINE", "OFFLINE", "ON_TRIP"]);
            const currentStatus = after.success && parseStatus(after.data.status, ["ONLINE", "OFFLINE", "ON_TRIP"]);
            if (!previousStatus || !currentStatus) throw new AiActionError("The original status snapshot is invalid.");
            const restored = await transaction.driver.updateMany({
                where: {
                    id: action.targetId,
                    status: currentStatus,
                    ...(identity.role === "ADMIN" && !identity.allOwnersAccess
                        ? { rickshaw: { is: { ownerId: { in: identity.ownerIds ?? [] } } } }
                        : {}),
                },
                data: { status: previousStatus },
            });
            if (restored.count !== 1) {
                throw new AiActionError("This driver changed or is outside your access now, so it was not reverted.");
            }
        }

        await transaction.aiActionLog.update({
            where: { id: action.id },
            data: { undoneAt: new Date() },
        });
        return { message: "AI action undone." };
    });
}
