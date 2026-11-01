/** Validate credentials, persist user/profile records, and issue approved-user JWTs. */
import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { normalizeBangladeshPhone } from "../../shared/phone.js";

const prisma = new PrismaClient();
const registerSchema = z
    .object({
        name: z.string().trim().min(1),
        email: z.union([
            z.string().trim().pipe(z.email()).transform((email) => email.toLowerCase()),
            z.literal(""),
        ]).optional(),
        phone: z.string().trim().min(1),
        password: z.string().min(4),
        role: z.enum(["DRIVER", "OWNER"]).default("DRIVER"),
        licenseNo: z.string().trim().optional(),
    });
const loginSchema = z.object({
    identifier: z.string().trim().min(1),
    password: z.string().min(1),
});

/** Create a pending driver or owner account and its role-specific profile. */
export const register = async (req: Request, res: Response) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: "Invalid registration details",
                errors: parsed.error.flatten(),
            });
        }

        const { name, password, role, licenseNo } = parsed.data;
        const email = parsed.data.email || null;
        const phone = normalizeBangladeshPhone(parsed.data.phone);
        if (!phone) {
            return res.status(400).json({
                message: "Enter a valid Bangladesh mobile number, such as +8801712345678",
            });
        }
        const profileData =
            role === "DRIVER"
                ? { driver: { create: { licenseNo: licenseNo || null } } }
                : role === "OWNER"
                  ? { owner: { create: {} } }
                  : null;

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                phone,
                password: hashedPassword,
                role,
                approvalStatus: "PENDING",
                ...profileData,
            },
        });

        res.status(201).json({
            message: "Registration successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                approvalStatus: user.approvalStatus,
            },
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return res
                .status(409)
                .json({
                    message:
                        "This email, phone number, or driving license number is already registered",
                });
        }
        console.error("Registration error:", error);
        res.status(500).json({ message: "Registration failed" });
    }
};

/** Check the identifier/password, reject unapproved accounts, then sign a JWT. */
export const login = async (req: Request, res: Response) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: "Invalid login details",
                errors: parsed.error.flatten(),
            });
        }

        const { identifier, password } = parsed.data;
        const isEmail = identifier.includes("@");
        const phone = isEmail ? null : normalizeBangladeshPhone(identifier);
        if (!isEmail && !phone) {
            return res.status(400).json({
                message: "Enter a valid email or Bangladesh mobile number",
            });
        }

        const lookup = isEmail
            ? { email: identifier.toLowerCase() }
            : phone
              ? { phone }
              : null;
        if (!lookup) {
            return res.status(400).json({
                message: "Enter a valid email or Bangladesh mobile number",
            });
        }
        const user = await prisma.user.findFirst({
            where: lookup,
            include: { driver: { select: { licenseNo: true } } },
        });

        if (!user) {
            return res
                .status(401)
                .json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res
                .status(401)
                .json({ message: "Invalid email or password" });
        }

        if (user.isRestricted) {
            return res.status(403).json({
                code: "ACCOUNT_RESTRICTED",
                message: "Your account has been restricted. Contact an administrator.",
            });
        }

        if (user.approvalStatus === "PENDING") {
            return res.status(403).json({
                code: "ACCOUNT_PENDING_APPROVAL",
                message: "Your account is awaiting admin approval",
            });
        }

        if (user.approvalStatus === "REJECTED") {
            return res.status(403).json({
                code: "ACCOUNT_REJECTED",
                message: "Your account registration was not approved",
            });
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res
                .status(500)
                .json({ message: "Authentication is not configured" });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, {
            expiresIn: "1d",
        });

        res.json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                approvalStatus: user.approvalStatus,
                driver: user.driver,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Login failed" });
    }
};
