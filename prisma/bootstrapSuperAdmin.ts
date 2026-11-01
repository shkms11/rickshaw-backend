import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();
const email = "superadmin@rickshaw.com";

async function main() {
    const isProduction = process.env.NODE_ENV === "production";
    const password = process.env.SUPER_ADMIN_PASSWORD ?? (isProduction ? undefined : "1234");
    const minimumLength = isProduction ? 12 : 4;
    if (!password || password.length < minimumLength) {
        throw new Error(
            process.env.NODE_ENV === "production"
                ? "Set SUPER_ADMIN_PASSWORD to a password with at least 12 characters in production."
                : "Set SUPER_ADMIN_PASSWORD to a password with at least 4 characters.",
        );
    }

    const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
    });
    if (existing && existing.role !== "SUPER_ADMIN") {
        throw new Error(`${email} already belongs to a non-super-admin account; refusing to promote it.`);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    if (existing) {
        await prisma.user.update({
            where: { id: existing.id },
            data: {
                name: "Platform Super Admin",
                password: hashedPassword,
                approvalStatus: "APPROVED",
                isRestricted: false,
            },
        });
    } else {
        await prisma.user.create({
            data: {
                name: "Platform Super Admin",
                email,
                password: hashedPassword,
                role: "SUPER_ADMIN",
                approvalStatus: "APPROVED",
                isRestricted: false,
            },
        });
    }

    console.log(`Super admin account is ready: ${email}`);
    if (password === "1234") {
        console.warn("Demo password enabled. Do not use this password in production.");
    }
}

main()
    .catch((error: unknown) => {
        console.error("Super admin bootstrap failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
