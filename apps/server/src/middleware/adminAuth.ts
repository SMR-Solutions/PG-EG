import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { createDb, owners } from "../db";
import { AuthPayload } from "./auth";

const DEFAULT_ADMIN_KEY = "pgeg-admin-2026";

function getAdminSecretKey(): string {
  return process.env.ADMIN_SECRET_KEY || DEFAULT_ADMIN_KEY;
}

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET env var not set");
  return s;
}

/**
 * requireAdmin middleware
 * Accepts either:
 *  1. Header `x-admin-key: <ADMIN_SECRET_KEY>`
 *  2. Header `Authorization: Bearer <token>` where owner record has role === 'admin'
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Check x-admin-key header
  const adminKeyHeader = req.headers["x-admin-key"];
  const expectedKey = getAdminSecretKey();
  if (typeof adminKeyHeader === "string" && adminKeyHeader.trim() === expectedKey) {
    return next();
  }

  // 2. Check Bearer token with role === 'admin'
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
      const db = createDb(process.env.DATABASE_URL!);
      const [owner] = await db
        .select({ id: owners.id, role: owners.role, email: owners.email })
        .from(owners)
        .where(eq(owners.id, decoded.ownerId))
        .limit(1);

      const adminEmails = (process.env.ADMIN_EMAIL || "")
        .toLowerCase()
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      const isMatch =
        (owner && owner.role === "admin") ||
        (owner?.email && adminEmails.includes(owner.email.toLowerCase()));

      if (isMatch) {
        req.owner = { ownerId: decoded.ownerId, phone: decoded.phone };
        return next();
      }
    } catch {
      // Token invalid or verification failed
    }
  }

  res.status(403).json({ error: "Admin authorization required. Provide valid x-admin-key or admin token." });
}
