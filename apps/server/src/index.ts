import dotenv from "dotenv";
dotenv.config(); // ← MUST be first, before any imports that read process.env

import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import ownersRouter from "./routes/owners";
import pgsRouter from "./routes/pgs";
import roomsRouter from "./routes/rooms";
import dashboardRouter from "./routes/dashboard";
import uploadRouter from "./routes/upload";
import tenantsRouter from "./routes/tenants";
import rentRouter from "./routes/rent";
import publicRouter from "./routes/public";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    const allowed = (process.env.FRONTEND_URL || "http://localhost:3000")
      .split(",")
      .map((u) => u.trim());
    if (allowed.includes(origin)) return callback(null, true);
    // Also allow localhost in any port during dev
    if (origin.startsWith("http://localhost")) return callback(null, true);
    return callback(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

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
app.use("/api/public", publicRouter);

// ─── Start ────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 PG-EG Server running on http://localhost:${PORT}`);
  console.log(`   Firebase Project: ${process.env.FIREBASE_PROJECT_ID}`);
});
