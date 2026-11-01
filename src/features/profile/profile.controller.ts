import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";
import { normalizeBangladeshPhone } from "../../shared/phone.js";
import { decryptNid, encryptNid } from "../../shared/nidEncryption.js";

const prisma = new PrismaClient();
type AuthRequest = Request & { auth?: { userId: string; role: string } };
const bangladeshDivisions = [
    "Barishal",
    "Chattogram",
    "Dhaka",
    "Khulna",
    "Mymensingh",
    "Rajshahi",
    "Rangpur",
    "Sylhet",
] as const;

const profileSchema = z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(1),
    email: z.union([z.string().trim().pipe(z.email()), z.literal("")]),
    nid: z.string().trim().max(20),
    dateOfBirth: z.union([z.iso.date(), z.literal("")]),
    division: z.enum([...bangladeshDivisions, ""]),
    district: z.string().trim().max(60),
    upazila: z.string().trim().max(60),
    unionWard: z.string().trim().max(80),
    villageRoad: z.string().trim().max(160),
    postalCode: z.string().trim().max(10),
    photoUrl: z.union([z.url().max(2048), z.literal("")]),
    licenseNo: z.string().trim().max(80).optional(),
});

export async function getMyProfile(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    try {
        const user = await prisma.user.findUnique({
            where: { id: auth.userId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                profile: {
                    select: {
                        nid: true,
                        nidIv: true,
                        nidAuthTag: true,
                        photoUrl: true,
                        dateOfBirth: true,
                        division: true,
                        district: true,
                        upazila: true,
                        unionWard: true,
                        villageRoad: true,
                        postalCode: true,
                    },
                },
                driver: { select: { licenseNo: true } },
            },
        });
        if (!user) return res.status(404).json({ message: "Account not found" });
        return res.json({
            profile: {
                ...user,
                profile: user.profile
                    ? { ...user.profile, nid: decryptNid(user.profile) }
                    : null,
            },
        });
    } catch (error) {
        console.error("Load user profile error:", error);
        return res.status(500).json({ message: "Could not load profile" });
    }
}

export async function updateMyProfile(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            message: "Check the profile fields and try again",
            errors: parsed.error.flatten(),
        });
    }

    const phone = normalizeBangladeshPhone(parsed.data.phone);
    if (!phone) {
        return res.status(400).json({ message: "Enter a valid Bangladesh mobile number" });
    }
    const { dateOfBirth, licenseNo, photoUrl, ...fields } = parsed.data;
    const email = fields.email.trim().toLowerCase() || null;
    let encryptedNid: ReturnType<typeof encryptNid>;
    try {
        encryptedNid = encryptNid(fields.nid);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("NID_ENCRYPTION_KEY")) {
            return res.status(503).json({ message: "NID storage is not configured" });
        }
        console.error("Encrypt profile NID error:", error);
        return res.status(500).json({ message: "Could not secure profile NID" });
    }
    const profileData = {
        ...encryptedNid,
        photoUrl: photoUrl || null,
        dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null,
        division: fields.division || null,
        district: fields.district || null,
        upazila: fields.upazila || null,
        unionWard: fields.unionWard || null,
        villageRoad: fields.villageRoad || null,
        postalCode: fields.postalCode || null,
    };

    try {
        await prisma.$transaction(async (transaction) => {
            const user = await transaction.user.update({
                where: { id: auth.userId },
                data: {
                    name: fields.name,
                    email,
                    phone,
                    profile: {
                        upsert: {
                            create: profileData,
                            update: profileData,
                        },
                    },
                },
                select: { role: true },
            });
            if (user.role === "DRIVER" && licenseNo !== undefined) {
                await transaction.driver.update({
                    where: { userId: auth.userId },
                    data: { licenseNo: licenseNo.trim() || null },
                });
            }
        });
        return res.json({ message: "Profile updated" });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return res.status(409).json({ message: "That email, phone, or license is already registered" });
        }
        console.error("Update user profile error:", error);
        return res.status(500).json({ message: "Could not update profile" });
    }
}
