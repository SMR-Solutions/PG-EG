import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { createDb, rooms, beds, pgs } from "../db";

const router = Router();

// ─── GET /api/rooms?pgId=xxx ──────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const { pgId } = req.query as { pgId: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    const db = createDb(process.env.DATABASE_URL!);
    const result = await db.select().from(rooms).where(eq(rooms.pgId, pgId));
    res.json({ rooms: result });
  } catch {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// ─── POST /api/rooms ──────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const { pgId, roomNumber, floor, bedsCount } = req.body as {
      pgId: string;
      roomNumber: string;
      floor: number;
      bedsCount: number;
    };

    if (!pgId || !roomNumber?.trim()) {
      res.status(400).json({ error: "pgId and roomNumber are required" });
      return;
    }
    if (!floor || floor < 1) {
      res.status(400).json({ error: "Valid floor number required" });
      return;
    }
    if (!bedsCount || bedsCount < 1 || bedsCount > 20) {
      res.status(400).json({ error: "Beds count must be 1–20" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);

    // Verify PG exists
    const pgResult = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
    if (!pgResult[0]) { res.status(404).json({ error: "PG not found" }); return; }

    // Check for duplicate room name on same floor
    const duplicate = await db.select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.pgId, pgId), eq(rooms.roomNumber, roomNumber.trim()), eq(rooms.floor, floor)))
      .limit(1);
    if (duplicate[0]) {
      res.status(409).json({ error: `Room "${roomNumber}" already exists on Floor ${floor}` });
      return;
    }

    // Create room
    const [room] = await db.insert(rooms).values({
      pgId,
      roomNumber: roomNumber.trim(),
      floor,
      sharingType: bedsCount,
      rentAmount: 0,
    }).returning();

    // Create bed records
    const bedValues = Array.from({ length: bedsCount }, (_, i) => ({
      roomId: room.id,
      bedNumber: i + 1,
      isOccupied: false,
    }));
    await db.insert(beds).values(bedValues);

    // Update total beds count in PG
    const allRooms = await db.select({ sharingType: rooms.sharingType }).from(rooms).where(eq(rooms.pgId, pgId));
    const totalBeds = allRooms.reduce((sum, r) => sum + r.sharingType, 0);
    await db.update(pgs).set({ totalBeds, updatedAt: new Date() }).where(eq(pgs.id, pgId));

    res.json({
      room: {
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        sharingType: room.sharingType,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// ─── DELETE /api/rooms/:id ────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    await db.delete(rooms).where(eq(rooms.id, req.params.id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete room" });
  }
});

export default router;
