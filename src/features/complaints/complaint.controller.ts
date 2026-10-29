import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { userId: string; role: string } };

const complaintSchema = z.object({
    subject: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(2000),
});
const complaintStatusSchema = z.object({
    status: z.enum(["OPEN", "RESOLVED"]),
});

export async function createComplaint(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    const parsed = complaintSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            message: "Enter a subject and a description of at least 10 characters",
        });
    }

    try {
        const complaint = await prisma.complaint.create({
            data: {
                userId: auth.userId,
                subject: parsed.data.subject,
                description: parsed.data.description,
            },
            select: { id: true, subject: true, status: true, createdAt: true },
        });
        return res.status(201).json({ complaint });
    } catch (error) {
        console.error("Create complaint error:", error);
        return res.status(500).json({ message: "Could not submit the report" });
    }
}

export async function listAdminComplaints(_req: Request, res: Response) {
    try {
        const complaints = await prisma.complaint.findMany({
            select: {
                id: true,
                subject: true,
                description: true,
                status: true,
                createdAt: true,
                user: { select: { name: true, phone: true, role: true } },
            },
            orderBy: [{ status: "asc" }, { createdAt: "desc" }],
            take: 100,
        });
        return res.json({ complaints });
    } catch (error) {
        console.error("List admin complaints error:", error);
        return res.status(500).json({ message: "Could not load reports" });
    }
}

export async function updateComplaintStatus(req: Request, res: Response) {
    const parsed = complaintStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Choose OPEN or RESOLVED" });
    }

    try {
        const result = await prisma.complaint.updateMany({
            where: { id: req.params.id as string },
            data: { status: parsed.data.status },
        });
        if (result.count === 0) return res.status(404).json({ message: "Report not found" });
        return res.json({ message: "Report status updated" });
    } catch (error) {
        console.error("Update complaint status error:", error);
        return res.status(500).json({ message: "Could not update report status" });
    }
}
