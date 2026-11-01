import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
type OwnerRequest = Request & { auth?: { userId: string; role: string } };

const periodSchema = z.enum(["today", "week", "month", "year", "all"]);
const entrySchema = z.object({
    rickshawId: z.string().trim().min(1),
    workDate: z.iso.date(),
    amount: z.coerce.number().finite().min(0.01).max(1_000_000),
});

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

function getDateRange(period: z.infer<typeof periodSchema>) {
    if (period === "all") return null;
    const { year, month, day } = dhakaDateParts(new Date());
    const today = new Date(Date.UTC(year, month - 1, day));
    const start = new Date(today);
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + 1);
    if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
    if (period === "month") start.setUTCDate(1);
    if (period === "year") start.setUTCMonth(0, 1);
    return { gte: start, lt: end };
}

function todayInDhaka() {
    const { year, month, day } = dhakaDateParts(new Date());
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function getOwnerRentalIncome(req: Request, res: Response) {
    const auth = (req as OwnerRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    const parsedPeriod = periodSchema.safeParse(req.query.period ?? "today");
    if (!parsedPeriod.success) return res.status(400).json({ message: "Choose a valid income period" });

    try {
        const owner = await prisma.owner.findUnique({
            where: { userId: auth.userId },
            select: { id: true },
        });
        if (!owner) return res.status(404).json({ message: "Owner profile not found" });
        const range = getDateRange(parsedPeriod.data);
        const where = {
            ownerId: owner.id,
            ...(range ? { workDate: range } : {}),
        };
        const [totals, byRickshaw, entries] = await Promise.all([
            prisma.ownerRentalIncomeEntry.aggregate({
                where,
                _count: { _all: true },
                _sum: { amount: true },
            }),
            prisma.ownerRentalIncomeEntry.groupBy({
                by: ["rickshawId"],
                where,
                _count: { _all: true },
                _sum: { amount: true },
                orderBy: { _sum: { amount: "desc" } },
            }),
            prisma.ownerRentalIncomeEntry.findMany({
                where,
                orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
                take: 10,
                select: {
                    id: true,
                    workDate: true,
                    amount: true,
                    rickshaw: { select: { plateNo: true } },
                },
            }),
        ]);
        const rickshawIds = byRickshaw.map((item) => item.rickshawId);
        const rickshaws = await prisma.rickshaw.findMany({
            where: { id: { in: rickshawIds }, ownerId: owner.id },
            select: { id: true, plateNo: true },
        });
        const plates = new Map(rickshaws.map((rickshaw) => [rickshaw.id, rickshaw.plateNo]));

        return res.json({
            period: parsedPeriod.data,
            totalRentalIncome: totals._sum.amount?.toString() ?? "0",
            rentalDays: totals._count._all,
            byRickshaw: byRickshaw.map((item) => ({
                rickshawId: item.rickshawId,
                plateNo: plates.get(item.rickshawId) ?? "",
                total: item._sum.amount?.toString() ?? "0",
                rentalDays: item._count._all,
            })),
            entries: entries.map((entry) => ({
                id: entry.id,
                workDate: entry.workDate.toISOString().slice(0, 10),
                amount: entry.amount.toString(),
                plateNo: entry.rickshaw.plateNo,
            })),
        });
    } catch (error) {
        console.error("Load owner rental income error:", error);
        return res.status(500).json({ message: "Could not load rental income" });
    }
}

export async function addOwnerRentalIncome(req: Request, res: Response) {
    const auth = (req as OwnerRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            message: "Enter a rickshaw, rental date, and valid daily rental amount",
            errors: parsed.error.flatten(),
        });
    }
    if (parsed.data.workDate > todayInDhaka()) {
        return res.status(400).json({ message: "Rental date cannot be in the future" });
    }

    try {
        const owner = await prisma.owner.findUnique({
            where: { userId: auth.userId },
            select: { id: true },
        });
        if (!owner) return res.status(404).json({ message: "Owner profile not found" });
        const rickshaw = await prisma.rickshaw.findFirst({
            where: { id: parsed.data.rickshawId, ownerId: owner.id },
            select: { id: true, plateNo: true },
        });
        if (!rickshaw) return res.status(404).json({ message: "Rickshaw not found in your fleet" });
        const entry = await prisma.ownerRentalIncomeEntry.create({
            data: {
                ownerId: owner.id,
                rickshawId: rickshaw.id,
                workDate: new Date(`${parsed.data.workDate}T00:00:00.000Z`),
                amount: parsed.data.amount,
            },
            select: {
                id: true,
                workDate: true,
                amount: true,
                rickshaw: { select: { plateNo: true } },
            },
        });
        return res.status(201).json({
            entry: {
                id: entry.id,
                workDate: entry.workDate.toISOString().slice(0, 10),
                amount: entry.amount.toString(),
                plateNo: entry.rickshaw.plateNo,
            },
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return res.status(409).json({ message: "Rental income is already recorded for this rickshaw and date" });
        }
        console.error("Save owner rental income error:", error);
        return res.status(500).json({ message: "Could not save rental income" });
    }
}
