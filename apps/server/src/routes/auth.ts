import { createRemoteJWKSet, jwtVerify } from "jose";
import jwt from "jsonwebtoken";
import { eq, asc } from "drizzle-orm";
import { Router, Request, Response } from "express";
import { createDb, owners, pgs } from "../db";

const router = Router();

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

function getProjectId() {
  const id = process.env.FIREBASE_PROJECT_ID;
  if (!id) throw new Error("FIREBASE_PROJECT_ID env var not set");
  return id;
}
function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET env var not set");
  return s;
}
const JWT_EXPIRES_IN = () => process.env.JWT_EXPIRES_IN || "30d";

async function verifyFirebaseToken(idToken: string) {
  const projectId = getProjectId();
  const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  }).catch((err) => {
    console.error("JWKS verify failed:", err.message, "| projectId:", projectId);
    throw err;
  });
  return payload as {
    sub: string;
    phone_number?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
}

// Include role in JWT so we can read it without a DB round-trip
function makeJwt(ownerId: string, phone: string, role: string) {
  return jwt.sign(
    { ownerId, phone, role },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN() } as jwt.SignOptions
  );
}

// ─── POST /api/auth/verify (Phone OTP) ───────────────────────────
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { idToken, name, role } = req.body as { idToken: string; name?: string; role?: string };
    if (!idToken) { res.status(400).json({ error: "idToken is required" }); return; }

    let firebasePayload: Awaited<ReturnType<typeof verifyFirebaseToken>>;
    try {
      firebasePayload = await verifyFirebaseToken(idToken);
    } catch {
      res.status(401).json({ error: "Invalid or expired Firebase token" }); return;
    }

    const { sub: firebaseUid, phone_number: phone } = firebasePayload;
    if (!phone) { res.status(400).json({ error: "Phone number not found in token" }); return; }

    const db = createDb(process.env.DATABASE_URL!);
    const existing = await db.select().from(owners).where(eq(owners.phone, phone)).limit(1);
    let owner = existing[0];
    const isNewUser = !owner;

    if (isNewUser) {
      if (!name || name.trim().length < 2) {
        res.status(400).json({ error: "Name is required for new users" }); return;
      }
      // Use provided role or default to 'owner'
      const assignedRole = role === "user" ? "user" : "owner";
      const [newOwner] = await db.insert(owners)
        .values({ name: name.trim(), phone, firebaseUid, role: assignedRole }).returning();
      owner = newOwner;
    } else if (owner.firebaseUid !== firebaseUid) {
      await db.update(owners).set({ firebaseUid, updatedAt: new Date() }).where(eq(owners.id, owner.id));
    }

    const ownerPGs = await db.select({ id: pgs.id, name: pgs.name }).from(pgs)
      .where(eq(pgs.ownerId, owner.id)).orderBy(asc(pgs.createdAt));
    const hasPG = ownerPGs.length > 0;
    const token = makeJwt(owner.id, owner.phone, owner.role);

    res.json({
      token,
      owner: { id: owner.id, name: owner.name, phone: owner.phone, role: owner.role },
      isNewUser,
      hasPG,
      role: owner.role,
      pgId: ownerPGs[0]?.id || null,
      pgs: ownerPGs,
    });
  } catch (error) {
    console.error("Auth verify error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ─── POST /api/auth/google (Google Sign-In) ───────────────────────
router.post("/google", async (req: Request, res: Response) => {
  try {
    const { idToken, role } = req.body as { idToken: string; role?: string };
    if (!idToken) { res.status(400).json({ error: "idToken is required" }); return; }

    let payload: Awaited<ReturnType<typeof verifyFirebaseToken>>;
    try {
      payload = await verifyFirebaseToken(idToken);
    } catch {
      res.status(401).json({ error: "Invalid or expired Firebase token" }); return;
    }

    const { sub: firebaseUid, email, name: googleName } = payload;
    if (!email) { res.status(400).json({ error: "Email not found in Google token" }); return; }

    const db = createDb(process.env.DATABASE_URL!);

    // Find by firebaseUid first, then by email
    let existingRows = await db.select().from(owners).where(eq(owners.firebaseUid, firebaseUid)).limit(1);
    if (!existingRows[0]) {
      existingRows = await db.select().from(owners).where(eq(owners.email, email)).limit(1);
    }

    let owner = existingRows[0];
    const isNewUser = !owner;

    if (isNewUser) {
      // Use provided role or default to 'owner'
      const assignedRole = role === "user" ? "user" : "owner";
      const [newOwner] = await db.insert(owners).values({
        name: googleName || email.split("@")[0],
        phone: email, // Google-only owners; phone can be linked later
        email,
        firebaseUid,
        role: assignedRole,
      }).returning();
      owner = newOwner;
    } else {
      await db.update(owners)
        .set({ firebaseUid, email, updatedAt: new Date() })
        .where(eq(owners.id, owner.id));
      owner = { ...owner, firebaseUid, email };
    }

    const ownerPGs = await db.select({ id: pgs.id, name: pgs.name }).from(pgs)
      .where(eq(pgs.ownerId, owner.id)).orderBy(asc(pgs.createdAt));
    const hasPG = ownerPGs.length > 0;
    const token = makeJwt(owner.id, owner.phone, owner.role);

    res.json({
      token,
      owner: { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email, role: owner.role },
      isNewUser,
      hasPG,
      role: owner.role,
      pgId: ownerPGs[0]?.id || null,
      pgs: ownerPGs,
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────
router.get("/me", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" }); return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, getJwtSecret()) as { ownerId: string };
    const db = createDb(process.env.DATABASE_URL!);

    const result = await db.select().from(owners).where(eq(owners.id, decoded.ownerId)).limit(1);
    if (!result[0]) { res.status(404).json({ error: "Owner not found" }); return; }

    const owner = result[0];
    const ownerPGs = await db.select({ id: pgs.id, name: pgs.name }).from(pgs)
      .where(eq(pgs.ownerId, owner.id)).orderBy(asc(pgs.createdAt));

    res.json({
      owner: { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email, photoUrl: owner.photoUrl, role: owner.role, createdAt: owner.createdAt },
      hasPG: ownerPGs.length > 0,
      role: owner.role,
      pgId: ownerPGs[0]?.id || null,
      pgs: ownerPGs,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
