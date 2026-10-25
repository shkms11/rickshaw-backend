import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";

const prisma = new PrismaClient();
const registerSchema = z.object({
    name: z.string().trim().min(1),
    email: z
        .string()
        .trim()
        .pipe(z.email())
        .transform((email) => email.toLowerCase()),
    password: z.string().min(8),
    role: z.enum(["DRIVER", "OWNER"]).optional(),
});
const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .pipe(z.email())
        .transform((email) => email.toLowerCase()),
    password: z.string().min(1),
});

export const register = async (req: Request, res: Response) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: "Invalid registration details",
                errors: parsed.error.flatten(),
            });
        }

        const { name, email, password, role } = parsed.data;

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role ?? "DRIVER",
                approvalStatus: "PENDING",
            },
        });

        res.status(201).json({
            message: "Registration successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
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
                .json({ message: "An account with this email already exists" });
        }
        res.status(500).json({ message: "Registration failed" });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: "Invalid login details",
                errors: parsed.error.flatten(),
            });
        }

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
            where: { email },
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
                role: user.role,
                approvalStatus: user.approvalStatus,
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Login failed" });
    }
};
