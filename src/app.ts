import express from "express";
import cors from "cors";

import adminRouter from "./features/admin/admin.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "Rickshaw API is running",
  });
});

// Admin routes
app.use("/api/admin", adminRouter);

export default app;
