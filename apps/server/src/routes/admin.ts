import { Router, Request, Response } from "express";
import { eq, desc, sql, and, or, ilike, inArray } from "drizzle-orm";
import { createDb, pgs, owners, rooms, beds, tenants } from "../db";
import { requireAdmin } from "../middleware/adminAuth";

const router = Router();

// Apply admin authentication to all endpoints in this router
router.use(requireAdmin);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── GET /api/admin/metrics ───────────────────────────────────────────
// Platform-wide KPIs for admin command center
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);

    // Aggregate counts
    const [pgStats] = await db
      .select({
        totalPgs: sql<number>`count(*)::int`,
        activePgs: sql<number>`count(*) filter (where ${pgs.isActive} = true)::int`,
        inactivePgs: sql<number>`count(*) filter (where ${pgs.isActive} = false)::int`,
        totalBeds: sql<number>`coalesce(sum(${pgs.totalBeds}), 0)::int`,
        liveVideosCount: sql<number>`count(*) filter (where ${pgs.liveVideoUrl} is not null or ${pgs.liveVideo} is not null)::int`,
      })
      .from(pgs);

    const [ownerStats] = await db
      .select({
        totalOwners: sql<number>`count(*)::int`,
      })
      .from(owners);

    const [roomStats] = await db
      .select({
        totalRooms: sql<number>`count(*)::int`,
      })
      .from(rooms);

    res.json({
      totalPgs: pgStats?.totalPgs || 0,
      activePgs: pgStats?.activePgs || 0,
      inactivePgs: pgStats?.inactivePgs || 0,
      totalBeds: pgStats?.totalBeds || 0,
      liveVideosCount: pgStats?.liveVideosCount || 0,
      totalOwners: ownerStats?.totalOwners || 0,
      totalRooms: roomStats?.totalRooms || 0,
    });
  } catch (err) {
    console.error("Admin metrics error:", err);
    res.status(500).json({ error: "Failed to fetch admin metrics" });
  }
});

// ─── GET /api/admin/pgs ───────────────────────────────────────────────
// List all PGs with joined owner info, room count, and filters
router.get("/pgs", async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    const { status, type, search } = req.query;

    const conditions = [];

    // Filter by Active / Inactive status
    if (status === "active") {
      conditions.push(eq(pgs.isActive, true));
    } else if (status === "inactive") {
      conditions.push(eq(pgs.isActive, false));
    }

    // Filter by PG type (gents / ladies / coliving)
    if (type && type !== "all" && typeof type === "string") {
      conditions.push(eq(pgs.type, type));
    }

    // Search query by PG name, city, address, owner name, or phone numbers
    if (search && typeof search === "string" && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(pgs.name, q),
          ilike(pgs.city, q),
          ilike(pgs.address, q),
          ilike(pgs.managerName, q),
          ilike(pgs.managerPhone, q),
          ilike(owners.name, q),
          ilike(owners.phone, q),
          ilike(owners.email, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const query = db
      .select({
        id: pgs.id,
        name: pgs.name,
        type: pgs.type,
        isActive: pgs.isActive,
        totalFloors: pgs.totalFloors,
        totalBeds: pgs.totalBeds,
        address: pgs.address,
        city: pgs.city,
        locationLink: pgs.locationLink,
        latitude: pgs.latitude,
        longitude: pgs.longitude,
        managerName: pgs.managerName,
        managerPhone: pgs.managerPhone,
        baseRent: pgs.baseRent,
        sharings: pgs.sharings,
        coverImageUrl: pgs.coverImageUrl,
        pgImages: pgs.pgImages,
        liveVideoUrl: pgs.liveVideoUrl,
        liveVideo: pgs.liveVideo,
        createdAt: pgs.createdAt,
        updatedAt: pgs.updatedAt,
        ownerId: owners.id,
        ownerName: owners.name,
        ownerPhone: owners.phone,
        ownerEmail: owners.email,
        ownerPhotoUrl: owners.photoUrl,
        ownerRole: owners.role,
        ownerCreatedAt: owners.createdAt,
      })
      .from(pgs)
      .innerJoin(owners, eq(pgs.ownerId, owners.id))
      .orderBy(desc(pgs.createdAt));

    const rows = whereClause ? await query.where(whereClause) : await query;

    // Get rooms counts grouped by pgId
    const roomCounts = await db
      .select({
        pgId: rooms.pgId,
        count: sql<number>`count(*)::int`,
      })
      .from(rooms)
      .groupBy(rooms.pgId);

    const roomCountMap = new Map(roomCounts.map((r) => [r.pgId, r.count]));

    const formatted = rows.map((row) => {
      let imagesCount = 0;
      let firstImage = row.coverImageUrl || null;
      try {
        const parsed = JSON.parse(row.pgImages || "[]");
        imagesCount = Array.isArray(parsed) ? parsed.length : 0;
        if (!firstImage && imagesCount > 0) {
          firstImage = typeof parsed[0] === "string" ? parsed[0] : parsed[0]?.url || null;
        }
      } catch {
        imagesCount = 0;
      }

      let parsedSharings: number[] = [1];
      try {
        parsedSharings = JSON.parse(row.sharings || "[1]");
      } catch {
        parsedSharings = [1];
      }

      return {
        id: row.id,
        name: row.name,
        type: row.type,
        isActive: row.isActive,
        totalFloors: row.totalFloors,
        totalBeds: row.totalBeds,
        roomsCount: roomCountMap.get(row.id) || 0,
        address: row.address,
        city: row.city,
        locationLink: row.locationLink,
        latitude: row.latitude,
        longitude: row.longitude,
        managerName: row.managerName,
        managerPhone: row.managerPhone,
        baseRent: row.baseRent,
        sharings: parsedSharings,
        imagesCount,
        firstImage,
        hasLiveVideo: !!(row.liveVideoUrl || row.liveVideo),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        owner: {
          id: row.ownerId,
          name: row.ownerName,
          phone: row.ownerPhone,
          email: row.ownerEmail,
          photoUrl: row.ownerPhotoUrl,
          role: row.ownerRole,
          createdAt: row.ownerCreatedAt,
        },
      };
    });

    res.json({ pgs: formatted });
  } catch (err) {
    console.error("Admin PGs list error:", err);
    res.status(500).json({ error: "Failed to fetch PGs list" });
  }
});

// ─── PATCH /api/admin/pgs/:id/status ──────────────────────────────────
// Toggle or set Active/Inactive status for a PG
router.patch("/pgs/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body as { isActive?: unknown };

    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: "Invalid PG ID" });
      return;
    }

    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "isActive must be a boolean" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);

    const [updated] = await db
      .update(pgs)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(pgs.id, id))
      .returning({
        id: pgs.id,
        name: pgs.name,
        isActive: pgs.isActive,
        updatedAt: pgs.updatedAt,
      });

    if (!updated) {
      res.status(404).json({ error: "PG not found" });
      return;
    }

    res.json({
      ok: true,
      pg: updated,
    });
  } catch (err) {
    console.error("Admin PG status update error:", err);
    res.status(500).json({ error: "Failed to update PG status" });
  }
});

// ─── GET /api/admin/pgs/:id ───────────────────────────────────────────
// Deep-dive details for a specific PG
router.get("/pgs/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: "Invalid PG ID" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);

    const [pgRecord] = await db
      .select()
      .from(pgs)
      .where(eq(pgs.id, id))
      .limit(1);

    if (!pgRecord) {
      res.status(404).json({ error: "PG not found" });
      return;
    }

    const [ownerRecord] = await db
      .select()
      .from(owners)
      .where(eq(owners.id, pgRecord.ownerId))
      .limit(1);

    // Fetch rooms with beds
    const pgRooms = await db
      .select()
      .from(rooms)
      .where(eq(rooms.pgId, id))
      .orderBy(rooms.floor, rooms.roomNumber);

    const roomIds = pgRooms.map((r) => r.id);
    let pgBeds: (typeof beds.$inferSelect)[] = [];
    if (roomIds.length > 0) {
      pgBeds = await db
        .select()
        .from(beds)
        .where(inArray(beds.roomId, roomIds));
    }

    // Fetch tenant counts
    const pgTenants = await db
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.pgId, id));

    const activeTenantsCount = pgTenants.filter((t) => t.status === "active").length;

    let parsedImages = [];
    try { parsedImages = JSON.parse(pgRecord.pgImages || "[]"); } catch { parsedImages = []; }

    let parsedDocs = [];
    try { parsedDocs = JSON.parse(pgRecord.pgDocuments || "[]"); } catch { parsedDocs = []; }

    let parsedLiveVideo = null;
    try { parsedLiveVideo = pgRecord.liveVideo ? JSON.parse(pgRecord.liveVideo) : null; } catch { parsedLiveVideo = null; }

    let parsedSharings = [1];
    try { parsedSharings = JSON.parse(pgRecord.sharings || "[1]"); } catch { parsedSharings = [1]; }

    res.json({
      pg: {
        ...pgRecord,
        pgImages: parsedImages,
        pgDocuments: parsedDocs,
        liveVideo: parsedLiveVideo,
        sharings: parsedSharings,
      },
      owner: ownerRecord || null,
      stats: {
        roomsCount: pgRooms.length,
        bedsCount: pgBeds.length,
        occupiedBedsCount: pgBeds.filter((b) => b.isOccupied).length,
        activeTenantsCount,
      },
      rooms: pgRooms.map((r) => ({
        ...r,
        beds: pgBeds.filter((b) => b.roomId === r.id),
      })),
    });
  } catch (err) {
    console.error("Admin PG detail error:", err);
    res.status(500).json({ error: "Failed to fetch PG details" });
  }
});

export default router;
