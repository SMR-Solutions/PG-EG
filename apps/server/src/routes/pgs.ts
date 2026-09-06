import { Router, Request, Response } from "express";
import { eq, asc } from "drizzle-orm";
import { createDb, pgs, owners } from "../db";

const router = Router();

function formatPg(pg: typeof pgs.$inferSelect) {
  return {
    id: pg.id,
    ownerId: pg.ownerId,
    name: pg.name,
    type: pg.type,
    totalFloors: pg.totalFloors,
    address: pg.address,
    locationLink: pg.locationLink,
    sharings: JSON.parse(pg.sharings),
    managerName: pg.managerName || null,
    managerPhone: pg.managerPhone || null,
    createdAt: pg.createdAt,
    updatedAt: pg.updatedAt,
  };
}

// ─── POST /api/pgs ────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const { ownerId, name, type, totalFloors, address, locationLink, sharings, managerName, managerPhone } =
      req.body as {
        ownerId: string;
        name: string;
        type: string;
        totalFloors: number;
        address: string;
        locationLink?: string;
        sharings: number[];
        managerName?: string;
        managerPhone?: string;
      };

    if (!ownerId) { res.status(400).json({ error: "ownerId is required" }); return; }
    if (!name || name.trim().length < 2) { res.status(400).json({ error: "PG name is required" }); return; }
    if (!["gents", "ladies", "co-living"].includes(type)) { res.status(400).json({ error: "Invalid PG type" }); return; }
    if (!sharings || sharings.length === 0) { res.status(400).json({ error: "Select at least one sharing type" }); return; }
    if (!managerName || managerName.trim().length < 2) { res.status(400).json({ error: "Manager name is required" }); return; }
    if (!managerPhone || managerPhone.trim().length < 6) { res.status(400).json({ error: "Manager phone is required" }); return; }

    const db = createDb(process.env.DATABASE_URL!);

    // Verify owner exists
    const ownerResult = await db.select({ id: owners.id }).from(owners).where(eq(owners.id, ownerId)).limit(1);
    if (!ownerResult[0]) { res.status(404).json({ error: "Owner not found" }); return; }

    // Always INSERT a new PG — never upsert.
    // Use PATCH /api/pgs/:id to update an existing PG.
    const sharingJson = JSON.stringify(sharings.sort((a, b) => a - b));
    const [pg] = await db.insert(pgs).values({
      ownerId,
      name: name.trim(),
      type,
      totalFloors,
      address: address.trim(),
      locationLink: locationLink || null,
      sharings: sharingJson,
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
    }).returning();

    res.status(201).json({ pg: formatPg(pg) });
  } catch (error) {
    console.error("Create PG error:", error);
    res.status(500).json({ error: "Failed to save PG details" });
  }
});

// ─── GET /api/pgs/owner/:ownerId ──────────
router.get("/owner/:ownerId", async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    const result = await db.select().from(pgs)
      .where(eq(pgs.ownerId, req.params.ownerId))
      .orderBy(asc(pgs.createdAt));
    res.json({ pgs: result.map(formatPg) });
  } catch {
    res.status(500).json({ error: "Failed to fetch PGs" });
  }
});

// ─── GET /api/pgs/:id ─────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    const result = await db.select().from(pgs).where(eq(pgs.id, req.params.id)).limit(1);
    if (!result[0]) { res.status(404).json({ error: "PG not found" }); return; }
    res.json({ pg: formatPg(result[0]) });
  } catch {
    res.status(500).json({ error: "Failed to fetch PG" });
  }
});

// ─── PATCH /api/pgs/:id ───────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { name, type, totalFloors, address, locationLink, sharings, managerName, managerPhone } = req.body as {
      name?: string; type?: string; totalFloors?: number;
      address?: string; locationLink?: string | null;
      sharings?: number[];
      managerName?: string;
      managerPhone?: string;
    };

    const db = createDb(process.env.DATABASE_URL!);
    const existing = await db.select().from(pgs).where(eq(pgs.id, req.params.id)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "PG not found" }); return; }

    const updates: Partial<typeof existing[0]> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (type !== undefined) updates.type = type;
    if (totalFloors !== undefined) updates.totalFloors = totalFloors;
    if (address !== undefined) updates.address = address.trim();
    if (locationLink !== undefined) updates.locationLink = locationLink;
    if (sharings !== undefined) updates.sharings = JSON.stringify(sharings.sort((a, b) => a - b));
    if (managerName !== undefined) updates.managerName = managerName.trim();
    if (managerPhone !== undefined) updates.managerPhone = managerPhone.trim();

    const [updated] = await db.update(pgs).set(updates).where(eq(pgs.id, req.params.id)).returning();
    res.json({ pg: formatPg(updated) });
  } catch (error) {
    console.error("Update PG error:", error);
    res.status(500).json({ error: "Failed to update PG" });
  }
});

export default router;
