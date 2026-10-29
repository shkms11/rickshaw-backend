import express from "express";
import cors from "cors";

import authRoutes from "./features/auth/auth.routes.js";
import driverRoutes from "./features/drivers/driver.routes.js";
import rickshawRoutes from "./features/rickshaws/rickshaw.routes.js";
import adminRouter from "./features/admin/admin.routes.js";
import complaintRoutes from "./features/complaints/complaint.routes.js";
import fleetActionRoutes from "./features/rickshaws/fleetActions.routes.js";

const app = express();

const defaultCorsOrigins = [
    "https://rickshaw-frontend-gjo4b2nhx-shkms11.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
];
const corsOrigins = (process.env.CORS_ORIGINS ?? defaultCorsOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: corsOrigins,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

app.use(express.json());

// Health check
app.get("/", (_req, res) => {
    res.status(200).json({
        message: "Rickshaw API is running",
    });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/rickshaws", rickshawRoutes);
app.use("/api/admin", adminRouter);
app.use("/api/complaints", complaintRoutes);
app.use("/api/fleet-actions", fleetActionRoutes);

export default app;
