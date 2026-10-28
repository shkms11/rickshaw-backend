import express from "express";
import cors from "cors";

import authRoutes from "./features/auth/auth.routes.js";
import driverRoutes from "./features/drivers/driver.routes.js";
import rickshawRoutes from "./features/rickshaws/rickshaw.routes.js";
import adminRouter from "./features/admin/admin.routes.js";

const app = express();

app.use(
    cors({
        origin: [
            "https://rickshaw-frontend-gjo4b2nhx-shkms11.vercel.app",
            "http://localhost:5173",
            "http://localhost:3000",
        ],
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

export default app;
