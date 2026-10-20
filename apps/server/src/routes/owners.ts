import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { createDb, owners } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ─── POST /api/owners ─────────────────────
// Legacy endpoint — registration must now go through /api/auth/verify or /api/auth/google
router.post("/", requireAuth, async (req: Request, res: Response) => {
  res.status(405).json({
    error: "Direct owner creation is disabled. Use authenticated sign-in flow (/api/auth/google or /api/auth/verify).",
  });
});

// ─── GET /api/owners/:id ──────────────────
// Authenticated — callers can only inspect their own account
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.owner?.ownerId !== req.params.id) {
      res.status(403).json({ error: "Forbidden: You can only view your own profile" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);
    const result = await db
      .select({
        id: owners.id,
        name: owners.name,
        phone: owners.phone,
        email: owners.email,
        photoUrl: owners.photoUrl,
        role: owners.role,
        createdAt: owners.createdAt,
      })
      .from(owners)
      .where(eq(owners.id, req.params.id))
      .limit(1);

    if (!result[0]) {
      res.status(404).json({ error: "Owner not found" });
      return;
    }
    res.json({ owner: result[0] });
  } catch (error) {
    console.error("Fetch owner error:", error);
    res.status(500).json({ error: "Failed to fetch owner" });
  }
});

// ─── PATCH /api/owners/:id ────────────────
// Authenticated — callers can only modify their own account
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.owner?.ownerId !== req.params.id) {
      res.status(403).json({ error: "Forbidden: You can only update your own profile" });
      return;
    }

    const { name, phone, email, photoUrl } = req.body as {
      name?: string;
      phone?: string;
      email?: string | null;
      photoUrl?: string | null;
    };
    const db = createDb(process.env.DATABASE_URL!);

    const existing = await db
      .select()
      .from(owners)
      .where(eq(owners.id, req.params.id))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: "Owner not found" });
      return;
    }

    const updates: Partial<typeof existing[0]> = { updatedAt: new Date() };

    if (name !== undefined) {
      if (name.trim().length < 2) {
        res.status(400).json({ error: "Name must be at least 2 characters" });
        return;
      }
      updates.name = name.trim();
    }
    if (phone !== undefined) {
      if (!/^\+91\d{10}$/.test(phone)) {
        res.status(400).json({ error: "Valid phone required (e.g. +91XXXXXXXXXX)" });
        return;
      }
      const phoneConflict = await db
        .select({ id: owners.id })
        .from(owners)
        .where(eq(owners.phone, phone))
        .limit(1);
      if (phoneConflict[0] && phoneConflict[0].id !== req.params.id) {
        res.status(409).json({ error: "This phone number is already registered" });
        return;
      }
      updates.phone = phone;
    }
    if (email !== undefined) updates.email = email ? email.trim().toLowerCase() : null;
    if ("photoUrl" in req.body) updates.photoUrl = photoUrl || null;

    const [updated] = await db
      .update(owners)
      .set(updates)
      .where(eq(owners.id, req.params.id))
      .returning();
    res.json({
      owner: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        photoUrl: updated.photoUrl,
      },
    });
  } catch (error) {
    console.error("Update owner error:", error);
    res.status(500).json({ error: "Failed to update owner" });
  }
});

export default router;
