import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding database...");

    // DEMO ONLY: this seed resets application records before rebuilding the demo dataset.

    await prisma.complaint.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.driverLocation.deleteMany();
    await prisma.rickshaw.deleteMany();
    await prisma.driver.deleteMany();
    await prisma.owner.deleteMany();
    await prisma.user.deleteMany();

    const password = await bcrypt.hash("Password123!", 10);

    // =========================
    // USERS
    // =========================

    await prisma.user.create({
        data: {
            name: "System Admin",
            email: "admin@rickshaw.com",
            phone: "+8801700000001",
            password,
            role: "ADMIN",
            approvalStatus: "APPROVED",
        },
    });

    const owner1 = await prisma.user.create({
        data: {
            name: "Rahman Transport",
            email: "rahman@rickshaw.com",
            phone: "+8801800000002",
            password,
            role: "OWNER",
            approvalStatus: "APPROVED",
        },
    });

    const owner2 = await prisma.user.create({
        data: {
            name: "Dhaka Rickshaw Services",
            email: "dhaka@rickshaw.com",
            phone: "+8801900000003",
            password,
            role: "OWNER",
            approvalStatus: "APPROVED",
        },
    });

    const driver1 = await prisma.user.create({
        data: {
            name: "Rahim Ahmed",
            email: "rahim@rickshaw.com",
            phone: "+8801600000004",
            password,
            role: "DRIVER",
            approvalStatus: "APPROVED",
        },
    });

    const driver2 = await prisma.user.create({
        data: {
            name: "Karim Uddin",
            email: "karim@rickshaw.com",
            phone: "+8801500000005",
            password,
            role: "DRIVER",
            approvalStatus: "APPROVED",
        },
    });

    const driver3 = await prisma.user.create({
        data: {
            name: "Sakib Hasan",
            email: "sakib@rickshaw.com",
            phone: "+8801300000006",
            password,
            role: "DRIVER",
            approvalStatus: "APPROVED",
        },
    });

    // Regular users who request trips
    const user1 = await prisma.user.create({
        data: {
            name: "Nusrat Jahan",
            email: "nusrat@example.com",
            phone: "+8801400000007",
            password,
            role: "DRIVER",
            approvalStatus: "APPROVED",
        },
    });

    const user2 = await prisma.user.create({
        data: {
            name: "Tanvir Hasan",
            email: "tanvir@example.com",
            phone: "+8801700000008",
            password,
            role: "DRIVER",
            approvalStatus: "APPROVED",
        },
    });

    // =========================
    // OWNERS
    // =========================

    const ownerProfile1 = await prisma.owner.create({
        data: {
            userId: owner1.id,
        },
    });

    const ownerProfile2 = await prisma.owner.create({
        data: {
            userId: owner2.id,
        },
    });

    // =========================
    // DRIVERS
    // =========================

    const driverProfile1 = await prisma.driver.create({
        data: {
            userId: driver1.id,
            licenseNo: "DL-10001",
            status: "ONLINE",
        },
    });

    const driverProfile2 = await prisma.driver.create({
        data: {
            userId: driver2.id,
            licenseNo: "DL-10002",
            status: "ON_TRIP",
        },
    });

    const driverProfile3 = await prisma.driver.create({
        data: {
            userId: driver3.id,
            licenseNo: "DL-10003",
            status: "OFFLINE",
        },
    });

    // =========================
    // RICKSHAWS
    // =========================

    const rickshaw1 = await prisma.rickshaw.create({
        data: {
            plateNo: "DHK-GA-1001",
            model: "Bajaj RE",
            status: "ACTIVE",
            ownerId: ownerProfile1.id,
            driverId: driverProfile1.id,
        },
    });

    const rickshaw2 = await prisma.rickshaw.create({
        data: {
            plateNo: "DHK-GA-1002",
            model: "TVS King",
            status: "ACTIVE",
            ownerId: ownerProfile1.id,
            driverId: driverProfile2.id,
        },
    });

    const rickshaw3 = await prisma.rickshaw.create({
        data: {
            plateNo: "DHK-GA-1003",
            model: "Bajaj RE",
            status: "INACTIVE",
            ownerId: ownerProfile2.id,
        },
    });

    const rickshaw4 = await prisma.rickshaw.create({
        data: {
            plateNo: "DHK-GA-1004",
            model: "Mahindra Alfa",
            status: "MAINTENANCE",
            ownerId: ownerProfile2.id,
        },
    });

    // These coordinates are fictional demo points; they are not real driver GPS reports.
    await prisma.driverLocation.createMany({
        data: [
            {
                driverId: driverProfile1.id,
                latitude: 23.7465,
                longitude: 90.376,
                source: "DEMO",
            },
            {
                driverId: driverProfile2.id,
                latitude: 23.8759,
                longitude: 90.3795,
                source: "DEMO",
            },
        ],
    });

    // =========================
    // TRIPS
    // =========================

    const trip1 = await prisma.trip.create({
        data: {
            passengerId: user1.id,
            driverId: driver1.id,
            rickshawId: rickshaw1.id,
            pickupLocation: "Kaliganj",
            dropoffLocation: "Dhaka",
            fare: 250,
            status: "COMPLETED",
        },
    });

    const trip2 = await prisma.trip.create({
        data: {
            passengerId: user2.id,
            driverId: driver2.id,
            rickshawId: rickshaw2.id,
            pickupLocation: "Uttara",
            dropoffLocation: "Mirpur",
            fare: 180,
            status: "IN_PROGRESS",
        },
    });

    const trip3 = await prisma.trip.create({
        data: {
            passengerId: user1.id,
            pickupLocation: "Dhanmondi",
            dropoffLocation: "Farmgate",
            fare: 120,
            status: "REQUESTED",
        },
    });

    const trip4 = await prisma.trip.create({
        data: {
            passengerId: user2.id,
            driverId: driver3.id,
            pickupLocation: "Gulshan",
            dropoffLocation: "Banani",
            fare: 150,
            status: "CANCELLED",
        },
    });

    // =========================
    // PAYMENTS
    // =========================

    await prisma.payment.create({
        data: {
            tripId: trip1.id,
            userId: user1.id,
            amount: 250,
            method: "CASH",
            status: "PAID",
        },
    });

    await prisma.payment.create({
        data: {
            tripId: trip2.id,
            userId: user2.id,
            amount: 180,
            method: "MOBILE_BANKING",
            status: "PAID",
        },
    });

    await prisma.payment.create({
        data: {
            tripId: trip3.id,
            userId: user1.id,
            amount: 120,
            method: "CARD",
            status: "PENDING",
        },
    });

    // =========================
    // COMPLAINTS
    // =========================

    await prisma.complaint.create({
        data: {
            userId: user1.id,
            tripId: trip1.id,
            subject: "Driver arrived late",
            description: "Driver arrived around 15 minutes late.",
            status: "OPEN",
        },
    });

    await prisma.complaint.create({
        data: {
            userId: user2.id,
            tripId: trip2.id,
            subject: "Route issue",
            description: "Driver took a longer route than expected.",
            status: "OPEN",
        },
    });

    await prisma.complaint.create({
        data: {
            userId: user1.id,
            tripId: trip4.id,
            subject: "Trip cancellation",
            description: "Trip was cancelled unexpectedly.",
            status: "RESOLVED",
        },
    });

    // =========================
    // OUTPUT
    // =========================

    console.log("");
    console.log("✅ Database seeded successfully!");
    console.log("");

    console.log("Demo accounts");
    console.log("------------------------------");
    console.log("Admin:  admin@rickshaw.com / +8801700000001");
    console.log("Owner:  rahman@rickshaw.com / +8801800000002");
    console.log("Owner:  dhaka@rickshaw.com / +8801900000003");
    console.log("Driver: rahim@rickshaw.com / +8801600000004");
    console.log("Driver: karim@rickshaw.com / +8801500000005");
    console.log("Driver: sakib@rickshaw.com / +8801300000006");
    console.log("------------------------------");
    console.log("Password: Password123!");
    console.log("");

    console.log("Data created:");
    console.log("• 8 users");
    console.log("• 2 owners");
    console.log("• 3 drivers");
    console.log("• 4 rickshaws");
    console.log("• 2 demo-only GPS locations");
    console.log("• 4 trips");
    console.log("• 3 payments");
    console.log("• 3 complaints");
}

main()
    .catch((error) => {
        console.error("❌ Seed failed:");
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
