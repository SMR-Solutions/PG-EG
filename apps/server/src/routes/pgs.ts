import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { createDb, pgs, owners } from "../db";

const router = Router();

// ─── POST /api/pgs ────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const { ownerId, name, type, totalFloors, address, locationLink, sharings } =
      req.body as {
        ownerId: string;
        name: string;
        type: string;
        totalFloors: number;
        address: string;
        locationLink?: string;
        sharings: number[];
      };

    if (!ownerId) { res.status(400).json({ error: "ownerId is required" }); return; }
    if (!name || name.trim().length < 2) { res.status(400).json({ error: "PG name is required" }); return; }
    if (!["gents", "ladies", "co-living"].includes(type)) { res.status(400).json({ error: "Invalid PG type" }); return; }
    if (!sharings || sharings.length === 0) { res.status(400).json({ error: "Select at least one sharing type" }); return; }

    const db = createDb(process.env.DATABASE_URL!);

    // Verify owner exists
    const ownerResult = await db.select({ id: owners.id }).from(owners).where(eq(owners.id, ownerId)).limit(1);
    if (!ownerResult[0]) { res.status(404).json({ error: "Owner not found" }); return; }

    // Check if owner already has a PG
    const existing = await db.select().from(pgs).where(eq(pgs.ownerId, ownerId)).limit(1);

    let pg = existing[0];
    const sharingJson = JSON.stringify(sharings.sort((a, b) => a - b));

    if (pg) {
      // Update existing
      const [updated] = await db.update(pgs).set({
        name: name.trim(),
        type,
        totalFloors,
        address: address.trim(),
        locationLink: locationLink || null,
        sharings: sharingJson,
        updatedAt: new Date(),
      }).where(eq(pgs.id, pg.id)).returning();
      pg = updated;
    } else {
      // Create new
      const [newPG] = await db.insert(pgs).values({
        ownerId,
        name: name.trim(),
        type,
        totalFloors,
        address: address.trim(),
        locationLink: locationLink || null,
        sharings: sharingJson,
      }).returning();
      pg = newPG;
    }

    res.json({
      pg: {
        id: pg.id,
        name: pg.name,
        type: pg.type,
        totalFloors: pg.totalFloors,
        address: pg.address,
        locationLink: pg.locationLink,
        sharings: JSON.parse(pg.sharings),
        createdAt: pg.createdAt,
      },
    });
  } catch (error) {
    console.error("Create PG error:", error);
    res.status(500).json({ error: "Failed to save PG details" });
  }
});

// ─── GET /api/pgs/:id ─────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    const result = await db.select().from(pgs).where(eq(pgs.id, req.params.id)).limit(1);
    if (!result[0]) { res.status(404).json({ error: "PG not found" }); return; }
    const pg = result[0];
    res.json({ pg: { ...pg, sharings: JSON.parse(pg.sharings) } });
  } catch {
    res.status(500).json({ error: "Failed to fetch PG" });
  }
});

export default router;
