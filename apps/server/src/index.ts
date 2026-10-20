import dotenv from "dotenv";
dotenv.config(); // ← MUST be first, before any imports that read process.env

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRouter from "./routes/auth";
import ownersRouter from "./routes/owners";
import pgsRouter from "./routes/pgs";
import roomsRouter from "./routes/rooms";
import dashboardRouter from "./routes/dashboard";
import uploadRouter from "./routes/upload";
import tenantsRouter from "./routes/tenants";
import rentRouter from "./routes/rent";
import publicRouter from "./routes/public";
import expensesRouter from "./routes/expenses";
import eventsRouter from "./routes/events";
import leadsRouter from "./routes/leads";

const app = express();
const PORT = process.env.PORT || 4000;

// Auto-detect production: explicit NODE_ENV, Render cloud environment (RENDER=true), or cloud service ID
if (process.env.RENDER === "true" || process.env.RENDER_SERVICE_ID) {
  process.env.NODE_ENV = "production";
}
const isProd = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

// ─── Production Startup Safeguards ──────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error("❌ CRITICAL: DATABASE_URL environment variable is not defined!");
}
if (!process.env.JWT_SECRET) {
  console.error("❌ CRITICAL: JWT_SECRET environment variable is not defined!");
} else if (isProd && process.env.JWT_SECRET.includes("change-in-production")) {
  console.warn("⚠️  SECURITY WARNING: Using default JWT_SECRET in production. Change this in Render dashboard!");
}

// ─── Security Headers (Helmet) ──────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Managed by Next.js client layer to allow MapTiler & ImageKit CDN
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// ─── Rate Limiting ──────────────────────────────────────────────
// General API throttle: 200 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes." },
});

// Stricter limiter for authentication: 30 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again after 15 minutes." },
});

// Stricter limiter for file uploads: 30 uploads per 15 minutes
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload rate limit exceeded, please wait before uploading more files." },
});

// Stricter limiter for public telemetry events: 120 events per 15 minutes
const eventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Event tracking rate limit reached." },
});

// Limiter for public geocoding & nearby places: 60 per 15 minutes
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many search requests, please slow down." },
});

app.use(generalLimiter);

// ─── CORS ───────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) return callback(null, true);
      const allowed = (process.env.FRONTEND_URL || "http://localhost:3000")
        .split(",")
        .map((u) => u.trim());
      if (allowed.includes(origin)) return callback(null, true);

      // Allow localhost in non-production environments
      if (!isProd && origin.startsWith("http://localhost")) {
        return callback(null, true);
      }

      // Deliberately decline without throwing uncaught exceptions
      return callback(null, false);
    },
    credentials: true,
  })
);

// ─── Body Parsers (Tuned Payload Armor) ──────────────────────────
// Standard routes capped at 2MB to prevent memory exhaustion (OOM) attacks
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ limit: "2mb", extended: true }));

// ─── Health Check ───────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "PG-EG",
    version: "1.0.0",
    environment: isProd ? "production" : "development",
  });
});

// ─── Routes with Scoped Protections ─────────────────────────────
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/owners", ownersRouter);
app.use("/api/pgs", pgsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/dashboard", dashboardRouter);

// Upload router receives a tailored 15MB JSON parser for base64 photo/document payloads
app.use(
  "/api/upload",
  uploadLimiter,
  express.json({ limit: "15mb" }),
  uploadRouter
);

app.use("/api/tenants", tenantsRouter);
app.use("/api/rent", rentRouter);
app.use("/api/public", publicLimiter, publicRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/events", eventsLimiter, eventsRouter);
app.use("/api/leads", leadsRouter);

// ─── 404 Handler for Unknown API Endpoints ──────────────────────
app.all("/api/*", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API route not found" });
});

// ─── Global Error Handler ───────────────────────────────────────
// Catches all unhandled errors, logs them internally, and prevents stack trace leakage
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API error:", err);
  if (res.headersSent) return;
  const status = err.status || 500;
  res.status(status).json({
    error: isProd ? "An internal server error occurred" : (err.message || "Internal server error"),
  });
});

// ─── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛡️  PG-EG Production-Hardened Server running on port ${PORT}`);
  console.log(`   Environment: ${isProd ? "production" : "development"}`);
  console.log(`   Firebase Project: ${process.env.FIREBASE_PROJECT_ID || "not set"}`);
});
