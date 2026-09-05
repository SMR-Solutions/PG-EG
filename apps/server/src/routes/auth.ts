import { createRemoteJWKSet, jwtVerify } from "jose";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { Router, Request, Response } from "express";
import { createDb, owners, pgs } from "../db";

const router = Router();

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

async function verifyFirebaseToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  return payload as { sub: string; phone_number: string };
}

// ─── POST /api/auth/verify ────────────────
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { idToken, name } = req.body as { idToken: string; name?: string };

    if (!idToken) {
      res.status(400).json({ error: "idToken is required" });
      return;
    }

    let firebasePayload: { sub: string; phone_number: string };
    try {
      firebasePayload = await verifyFirebaseToken(idToken);
    } catch {
      res.status(401).json({ error: "Invalid or expired Firebase token" });
      return;
    }

    const { sub: firebaseUid, phone_number: phone } = firebasePayload;
    if (!phone) {
      res.status(400).json({ error: "Phone number not found in token" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);
    const existing = await db
      .select()
      .from(owners)
      .where(eq(owners.phone, phone))
      .limit(1);

    let owner = existing[0];
    const isNewUser = !owner;

    if (isNewUser) {
      if (!name || name.trim().length < 2) {
        res.status(400).json({ error: "Name is required for new users" });
        return;
      }
      const [newOwner] = await db
        .insert(owners)
        .values({ name: name.trim(), phone, firebaseUid })
        .returning();
      owner = newOwner;
    } else if (owner.firebaseUid !== firebaseUid) {
      await db
        .update(owners)
        .set({ firebaseUid, updatedAt: new Date() })
        .where(eq(owners.id, owner.id));
    }

    const ownerPGs = await db
      .select({ id: pgs.id })
      .from(pgs)
      .where(eq(pgs.ownerId, owner.id))
      .limit(1);

    const hasPG = ownerPGs.length > 0;

    const token = jwt.sign(
      { ownerId: owner.id, phone: owner.phone },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.json({
      token,
      owner: { id: owner.id, name: owner.name, phone: owner.phone },
      isNewUser,
      hasPG,
    });
  } catch (error) {
    console.error("Auth verify error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ─── GET /api/auth/me ─────────────────────
router.get("/me", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { ownerId: string };
    const db = createDb(process.env.DATABASE_URL!);

    const result = await db
      .select()
      .from(owners)
      .where(eq(owners.id, decoded.ownerId))
      .limit(1);

    if (!result[0]) {
      res.status(404).json({ error: "Owner not found" });
      return;
    }

    const owner = result[0];
    const ownerPGs = await db
      .select({ id: pgs.id, name: pgs.name })
      .from(pgs)
      .where(eq(pgs.ownerId, owner.id));

    res.json({
      owner: { id: owner.id, name: owner.name, phone: owner.phone, createdAt: owner.createdAt },
      hasPG: ownerPGs.length > 0,
      pgs: ownerPGs,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
