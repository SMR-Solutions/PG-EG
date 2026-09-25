import { Router, Request, Response } from "express";
import { eq, asc, and, gt, inArray } from "drizzle-orm";
import { createDb, pgs, owners, rooms, beds } from "../db";
import { requireAuth, verifyPgOwnership } from "../middleware/auth";
import { resolveMapsLink } from "../utils/maps";

const router = Router();

function formatPg(pg: typeof pgs.$inferSelect) {
  return {
    id: pg.id, ownerId: pg.ownerId, name: pg.name, type: pg.type,
    totalFloors: pg.totalFloors, address: pg.address, locationLink: pg.locationLink,
    sharings: JSON.parse(pg.sharings), managerName: pg.managerName || null,
    managerPhone: pg.managerPhone || null,
    latitude: pg.latitude || null, longitude: pg.longitude || null,
    createdAt: pg.createdAt, updatedAt: pg.updatedAt,
  };
}

// ─── POST /api/pgs ────────────────────────
// Caller must be authenticated; ownerId is taken from the token (never from body)
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, type, totalFloors, address, locationLink, sharings, managerName, managerPhone } =
      req.body as {
        name: string; type: string; totalFloors: number; address: string;
        locationLink?: string; sharings: number[]; managerName?: string; managerPhone?: string;
      };

    // ownerId comes from the verified JWT, NOT from the request body
    const ownerId = req.owner!.ownerId;

    if (!name || name.trim().length < 2) { res.status(400).json({ error: "PG name is required" }); return; }
    if (!["gents", "ladies", "co-living"].includes(type)) { res.status(400).json({ error: "Invalid PG type" }); return; }
    if (!sharings || sharings.length === 0) { res.status(400).json({ error: "Select at least one sharing type" }); return; }
    if (!managerName || managerName.trim().length < 2) { res.status(400).json({ error: "Manager name is required" }); return; }
    if (!managerPhone || managerPhone.trim().length < 6) { res.status(400).json({ error: "Manager phone is required" }); return; }

    const db = createDb(process.env.DATABASE_URL!);

    // Verify owner exists
    const ownerResult = await db.select({ id: owners.id }).from(owners).where(eq(owners.id, ownerId)).limit(1);
    if (!ownerResult[0]) { res.status(404).json({ error: "Owner not found" }); return; }

    const sharingJson = JSON.stringify(sharings.sort((a, b) => a - b));

    // Auto-extract coordinates from locationLink
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (locationLink) {
      const coords = await resolveMapsLink(locationLink);
      if (coords) { latitude = coords.lat; longitude = coords.lng; }
    }

    const [pg] = await db.insert(pgs).values({
      ownerId, name: name.trim(), type, totalFloors,
      address: address.trim(), locationLink: locationLink || null,
      sharings: sharingJson, managerName: managerName.trim(), managerPhone: managerPhone.trim(),
      latitude, longitude,
    }).returning();

    res.status(201).json({ pg: formatPg(pg) });
  } catch (error) {
    console.error("Create PG error:", error);
    res.status(500).json({ error: "Failed to save PG details" });
  }
});

// ─── GET /api/pgs/owner/:ownerId ──────────
// Only returns PGs owned by the authenticated caller
router.get("/owner/:ownerId", requireAuth, async (req: Request, res: Response) => {
  try {
    // Ignore the URL param — always use the token's ownerId to prevent IDOR
    const ownerId = req.owner!.ownerId;
    const db = createDb(process.env.DATABASE_URL!);
    const result = await db.select().from(pgs)
      .where(eq(pgs.ownerId, ownerId))
      .orderBy(asc(pgs.createdAt));
    res.json({ pgs: result.map(formatPg) });
  } catch {
    res.status(500).json({ error: "Failed to fetch PGs" });
  }
});

// ─── GET /api/pgs/:id ─────────────────────
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const pg = await verifyPgOwnership(req.params.id, req.owner!.ownerId, res);
    if (!pg) return;
    res.json({ pg: formatPg(pg) });
  } catch {
    res.status(500).json({ error: "Failed to fetch PG" });
  }
});

// ─── PATCH /api/pgs/:id ───────────────────
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, type, totalFloors, address, locationLink, sharings, managerName, managerPhone } = req.body as {
      name?: string; type?: string; totalFloors?: number;
      address?: string; locationLink?: string | null;
      sharings?: number[]; managerName?: string; managerPhone?: string;
    };

    // Verify caller owns this PG before allowing updates
    const existing = await verifyPgOwnership(req.params.id, req.owner!.ownerId, res);
    if (!existing) return;

    const db = createDb(process.env.DATABASE_URL!);

    // ── Guard: block floor-count decrease if affected floors have tenants ──
    if (totalFloors !== undefined && totalFloors < existing.totalFloors) {
      // Find all rooms on floors > newTotalFloors
      const affectedRooms = await db
        .select({ id: rooms.id, floor: rooms.floor })
        .from(rooms)
        .where(and(eq(rooms.pgId, req.params.id), gt(rooms.floor, totalFloors)));

      if (affectedRooms.length > 0) {
        const roomIds = affectedRooms.map((r) => r.id);
        const occupiedBeds = await db
          .select({ id: beds.id, roomId: beds.roomId })
          .from(beds)
          .where(and(inArray(beds.roomId, roomIds), eq(beds.isOccupied, true)));

        if (occupiedBeds.length > 0) {
          // Collect which floor numbers are blocked
          const occupiedRoomIds = new Set(occupiedBeds.map((b) => b.roomId));
          const blockedFloors = [...new Set(
            affectedRooms.filter((r) => occupiedRoomIds.has(r.id)).map((r) => r.floor)
          )].sort((a, b) => a - b);

          res.status(409).json({
            error: `Cannot reduce floors to ${totalFloors}: Floor${blockedFloors.length > 1 ? "s" : ""} ${blockedFloors.join(", ")} still ${blockedFloors.length > 1 ? "have" : "has"} occupied beds. Check out all tenants on those floors first.`,
            blockedFloors,
          });
          return;
        }
      }
    }

    const updates: Partial<typeof existing> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (type !== undefined) updates.type = type;
    if (totalFloors !== undefined) updates.totalFloors = totalFloors;
    if (address !== undefined) updates.address = address.trim();
    if (locationLink !== undefined) {
      updates.locationLink = locationLink;
      // Re-extract coordinates if locationLink changed
      if (locationLink) {
        const coords = await resolveMapsLink(locationLink);
        if (coords) { updates.latitude = coords.lat; updates.longitude = coords.lng; }
      } else {
        updates.latitude = null; updates.longitude = null;
      }
    }
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
