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

export default router;
