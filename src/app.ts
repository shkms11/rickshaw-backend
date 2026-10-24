import express from "express";
import cors from "cors";
import authRoutes from "./features/auth/auth.routes";
import driverRoutes from "./features/driver/driver.routes";

import adminRouter from "./features/admin/admin.routes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/drivers", driverRoutes);

app.get("/", (_req, res) => {
  res.json({
    message: "Rickshaw API is running",
  });
});

// Admin routes
app.use("/api/admin", adminRouter);

export default app;
