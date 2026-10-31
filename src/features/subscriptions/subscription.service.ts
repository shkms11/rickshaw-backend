import { PrismaClient } from "../../generated/prisma/client.js";

export const prisma = new PrismaClient();

export const TRIAL_DAYS = 7;
export const PRICE_PER_RICKSHAW = 100;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type OwnerBillingAccount = {
    ownerId: string;
    subscription: {
        id: string;
        trialStartedAt: Date;
        paidUntil: Date | null;
        isDemo: boolean;
    };
    rickshawCount: number;
};

export async function getOwnerBillingAccount(
    userId: string,
): Promise<OwnerBillingAccount | null> {
    const owner = await prisma.owner.findUnique({
        where: { userId },
        select: {
            id: true,
            subscription: {
                select: {
                    id: true,
                    trialStartedAt: true,
                    paidUntil: true,
                    isDemo: true,
                },
            },
        },
    });
    if (!owner) return null;

    let subscription = owner.subscription ?? await prisma.ownerSubscription.upsert({
        where: { ownerId: owner.id },
        create: { ownerId: owner.id },
        update: {},
        select: { id: true, trialStartedAt: true, paidUntil: true, isDemo: true },
    });
    const now = new Date();
    if (
        subscription.isDemo &&
        (subscription.paidUntil === null || subscription.paidUntil <= now) &&
        getTrialEnd(subscription.trialStartedAt) <= now
    ) {
        subscription = await prisma.ownerSubscription.update({
            where: { id: subscription.id },
            data: { trialStartedAt: now },
            select: { id: true, trialStartedAt: true, paidUntil: true, isDemo: true },
        });
    }
    const rickshawCount = await prisma.rickshaw.count({
        where: { ownerId: owner.id, status: { not: "INACTIVE" } },
    });

    return { ownerId: owner.id, subscription, rickshawCount };
}

export function getTrialEnd(trialStartedAt: Date) {
    return new Date(trialStartedAt.getTime() + TRIAL_DAYS * DAY_IN_MS);
}

export function hasActiveSubscription(
    subscription: OwnerBillingAccount["subscription"],
    now = new Date(),
) {
    return getTrialEnd(subscription.trialStartedAt) > now ||
        (subscription.paidUntil !== null && subscription.paidUntil > now);
}

export function addOneMonth(date: Date) {
    const result = new Date(date);
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + 1);
    const lastDay = new Date(
        Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
}

export function getMonthlyPrice(rickshawCount: number) {
    return rickshawCount * PRICE_PER_RICKSHAW;
}
