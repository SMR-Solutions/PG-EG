import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { createDb, owners } from "../db";

const router = Router();

// ─── POST /api/owners ─────────────────────
// Create or update an owner (no auth yet)
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, phone } = req.body as { name: string; phone: string };

    if (!name || name.trim().length < 2) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    if (!phone || !/^\+91\d{10}$/.test(phone)) {
      res.status(400).json({ error: "Valid phone number required (e.g. +91XXXXXXXXXX)" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);

    // Check if owner with this phone already exists
    const existing = await db
      .select()
      .from(owners)
      .where(eq(owners.phone, phone))
      .limit(1);

    let owner = existing[0];

    if (owner) {
      // Update name if it changed
      if (owner.name !== name.trim()) {
        const [updated] = await db
          .update(owners)
          .set({ name: name.trim(), updatedAt: new Date() })
          .where(eq(owners.id, owner.id))
          .returning();
        owner = updated;
      }
    } else {
      // Create new owner
      const [newOwner] = await db
        .insert(owners)
        .values({ name: name.trim(), phone })
        .returning();
      owner = newOwner;
    }

    res.json({
      owner: {
        id: owner.id,
        name: owner.name,
        phone: owner.phone,
        createdAt: owner.createdAt,
      },
    });
  } catch (error) {
    console.error("Create owner error:", error);
    res.status(500).json({ error: "Failed to save owner details" });
  }
});

// ─── GET /api/owners/:id ──────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    const result = await db
      .select()
      .from(owners)
      .where(eq(owners.id, req.params.id))
      .limit(1);

    if (!result[0]) {
      res.status(404).json({ error: "Owner not found" });
      return;
    }
    res.json({ owner: result[0] });
  } catch {
    res.status(500).json({ error: "Failed to fetch owner" });
  }
});

// ─── PATCH /api/owners/:id ────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { name, phone, email, photoUrl } = req.body as { name?: string; phone?: string; email?: string | null; photoUrl?: string | null; };
    const db = createDb(process.env.DATABASE_URL!);

    const existing = await db.select().from(owners).where(eq(owners.id, req.params.id)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Owner not found" }); return; }

    const updates: Partial<typeof existing[0]> = { updatedAt: new Date() };

    if (name !== undefined) {
      if (name.trim().length < 2) { res.status(400).json({ error: "Name must be at least 2 characters" }); return; }
      updates.name = name.trim();
    }
    if (phone !== undefined) {
      if (!/^\+91\d{10}$/.test(phone)) {
        res.status(400).json({ error: "Valid phone required (e.g. +91XXXXXXXXXX)" }); return;
      }
      const phoneConflict = await db.select({ id: owners.id }).from(owners).where(eq(owners.phone, phone)).limit(1);
      if (phoneConflict[0] && phoneConflict[0].id !== req.params.id) {
        res.status(409).json({ error: "This phone number is already registered" }); return;
      }
      updates.phone = phone;
    }
    if (email !== undefined) updates.email = email || null;
    if ("photoUrl" in req.body) updates.photoUrl = photoUrl || null;

    const [updated] = await db.update(owners).set(updates).where(eq(owners.id, req.params.id)).returning();
    res.json({ owner: { id: updated.id, name: updated.name, phone: updated.phone, email: updated.email, photoUrl: updated.photoUrl } });
  } catch (error) {
    console.error("Update owner error:", error);
    res.status(500).json({ error: "Failed to update owner" });
  }
});

export default router;
