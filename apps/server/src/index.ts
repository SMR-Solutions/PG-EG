import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from "./routes/auth";
import ownersRouter from "./routes/owners";
import pgsRouter from "./routes/pgs";
import roomsRouter from "./routes/rooms";
import dashboardRouter from "./routes/dashboard";
import uploadRouter from "./routes/upload";
import tenantsRouter from "./routes/tenants";
import rentRouter from "./routes/rent";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" })); // large enough for base64 images

// ─── Routes ───────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "PG-EG API is running 🏠" });
});

app.use("/api/auth", authRouter);
app.use("/api/owners", ownersRouter);
app.use("/api/pgs", pgsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/tenants", tenantsRouter);
app.use("/api/rent", rentRouter);

// ─── Start ────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 PG-EG Server running on http://localhost:${PORT}`);
});
