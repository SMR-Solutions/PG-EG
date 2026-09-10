import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq, and } from "drizzle-orm";
import { createDb, pgs } from "../db";

// ─── Token payload shape ───────────────────────────────────────────
export interface AuthPayload {
  ownerId: string;
  phone: string;
}

// Extend Express Request to carry the verified owner identity
declare global {
  namespace Express {
    interface Request {
      owner?: AuthPayload;
    }
  }
}

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET env var not set");
  return s;
}

// ─── requireAuth ──────────────────────────────────────────────────
// Verifies the Bearer JWT and attaches req.owner.
// Returns 401 if token is missing, malformed, or expired.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
    req.owner = { ownerId: decoded.ownerId, phone: decoded.phone };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── verifyPgOwnership ────────────────────────────────────────────
// Confirms that the PG with `pgId` is owned by `ownerId`.
// Returns the PG row on success, or sends 403/404 and returns null.
export async function verifyPgOwnership(
  pgId: string,
  ownerId: string,
  res: Response
): Promise<typeof pgs.$inferSelect | null> {
  const db = createDb(process.env.DATABASE_URL!);
  const [pg] = await db
    .select()
    .from(pgs)
    .where(and(eq(pgs.id, pgId), eq(pgs.ownerId, ownerId)))
    .limit(1);

  if (!pg) {
    // Deliberately ambiguous — don't reveal whether the PG exists at all
    res.status(403).json({ error: "Forbidden: you do not own this PG" });
    return null;
  }
  return pg;
}
