import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { createDb, rooms, beds, pgs } from "../db";
import { requireAuth, verifyPgOwnership } from "../middleware/auth";

const router = Router();

// ─── GET /api/rooms?pgId=xxx ──────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId } = req.query as { pgId: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }
    const pg = await verifyPgOwnership(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const db = createDb(process.env.DATABASE_URL!);
    const result = await db.select().from(rooms).where(eq(rooms.pgId, pgId));
    res.json({ rooms: result });
  } catch {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// ─── POST /api/rooms ──────────────────────
router.post("/", requireAuth, async (req: Request, res: Response) => {
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

    // Verify PG exists AND caller owns it
    const pgOwned = await verifyPgOwnership(pgId, req.owner!.ownerId, res);
    if (!pgOwned) return;

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

// ─── PATCH /api/rooms/:id — rename room ───────────
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    const { roomNumber } = req.body as { roomNumber: string };
    if (!roomNumber?.trim()) { res.status(400).json({ error: "roomNumber is required" }); return; }

    const room = await db.select().from(rooms).where(eq(rooms.id, req.params.id)).limit(1);
    if (!room[0]) { res.status(404).json({ error: "Room not found" }); return; }
    const pg = await verifyPgOwnership(room[0].pgId, req.owner!.ownerId, res);
    if (!pg) return;

    // Check for duplicate name on same floor (excluding this room)
    const duplicate = await db.select({ id: rooms.id }).from(rooms)
      .where(and(eq(rooms.pgId, room[0].pgId), eq(rooms.roomNumber, roomNumber.trim()), eq(rooms.floor, room[0].floor)))
      .limit(1);
    if (duplicate[0] && duplicate[0].id !== req.params.id) {
      res.status(409).json({ error: `Room "${roomNumber}" already exists on Floor ${room[0].floor}` }); return;
    }

    const [updated] = await db.update(rooms)
      .set({ roomNumber: roomNumber.trim() })
      .where(eq(rooms.id, req.params.id))
      .returning();
    res.json({ room: { id: updated.id, roomNumber: updated.roomNumber, floor: updated.floor, sharingType: updated.sharingType } });
  } catch (error) {
    console.error("Rename room error:", error);
    res.status(500).json({ error: "Failed to rename room" });
  }
});

// ─── DELETE /api/rooms/:id ────────────────
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    const room = await db.select().from(rooms).where(eq(rooms.id, req.params.id)).limit(1);
    if (!room[0]) { res.status(404).json({ error: "Room not found" }); return; }
    const pg = await verifyPgOwnership(room[0].pgId, req.owner!.ownerId, res);
    if (!pg) return;

    // Block deletion if any bed is occupied
    const roomBeds = await db.select().from(beds).where(eq(beds.roomId, req.params.id));
    const occupiedCount = roomBeds.filter((b) => b.isOccupied).length;
    if (occupiedCount > 0) {
      res.status(409).json({
        error: `Cannot delete room: ${occupiedCount} bed${occupiedCount > 1 ? "s are" : " is"} occupied. Check out all tenants first.`,
        occupiedCount,
      });
      return;
    }

    const pgId = room[0].pgId;
    await db.delete(rooms).where(eq(rooms.id, req.params.id));
    // Recalculate totalBeds
    const allRooms = await db.select({ sharingType: rooms.sharingType }).from(rooms).where(eq(rooms.pgId, pgId));
    const totalBeds = allRooms.reduce((sum, r) => sum + r.sharingType, 0);
    await db.update(pgs).set({ totalBeds, updatedAt: new Date() }).where(eq(pgs.id, pgId));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete room" });
  }
});

// ─── POST /api/beds — add one bed to a room ─
 router.post("/beds", requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.body as { roomId: string };
    if (!roomId) { res.status(400).json({ error: "roomId required" }); return; }

    const db = createDb(process.env.DATABASE_URL!);
    const roomResult = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!roomResult[0]) { res.status(404).json({ error: "Room not found" }); return; }
    const room = roomResult[0];
    const pg = await verifyPgOwnership(room.pgId, req.owner!.ownerId, res);
    if (!pg) return;

    // Find next bed number
    const existingBeds = await db.select({ bedNumber: beds.bedNumber }).from(beds).where(eq(beds.roomId, roomId));
    const maxBedNum = existingBeds.reduce((max, b) => Math.max(max, b.bedNumber), 0);
    const newBedNumber = maxBedNum + 1;

    const [bed] = await db.insert(beds).values({ roomId, bedNumber: newBedNumber, isOccupied: false }).returning();

    // Update room sharingType to actual bed count
    const newSharingType = existingBeds.length + 1;
    await db.update(rooms).set({ sharingType: newSharingType }).where(eq(rooms.id, roomId));

    // Recalculate PG totalBeds
    const allRooms = await db.select({ sharingType: rooms.sharingType }).from(rooms).where(eq(rooms.pgId, room.pgId));
    const totalBeds = allRooms.reduce((sum, r) => sum + r.sharingType, 0) + 1; // +1 for the just-updated room
    await db.update(pgs).set({ totalBeds: totalBeds - room.sharingType + newSharingType, updatedAt: new Date() }).where(eq(pgs.id, room.pgId));

    res.status(201).json({ bed: { id: bed.id, bedNumber: bed.bedNumber, isOccupied: false } });
  } catch (error) {
    console.error("Add bed error:", error);
    res.status(500).json({ error: "Failed to add bed" });
  }
});

// ─── DELETE /api/beds/:id — remove one bed ─
router.delete("/beds/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);

    const bedResult = await db.select().from(beds).where(eq(beds.id, req.params.id)).limit(1);
    if (!bedResult[0]) { res.status(404).json({ error: "Bed not found" }); return; }
    const bed = bedResult[0];

    if (bed.isOccupied) {
      res.status(409).json({ error: "Cannot remove an occupied bed. Check out the tenant first." });
      return;
    }
    // Verify ownership before deletion
    const roomForOwnership = await db.select({ pgId: rooms.pgId }).from(rooms).where(eq(rooms.id, bed.roomId)).limit(1);
    if (!roomForOwnership[0]) { res.status(404).json({ error: "Room not found" }); return; }
    const pg = await verifyPgOwnership(roomForOwnership[0].pgId, req.owner!.ownerId, res);
    if (!pg) return;

    await db.delete(beds).where(eq(beds.id, req.params.id));

    // Update room sharingType to remaining bed count
    const remainingBeds = await db.select({ id: beds.id }).from(beds).where(eq(beds.roomId, bed.roomId));
    const newSharingType = remainingBeds.length;
    await db.update(rooms).set({ sharingType: newSharingType }).where(eq(rooms.id, bed.roomId));

    // Recalculate PG totalBeds
    const room = await db.select({ pgId: rooms.pgId }).from(rooms).where(eq(rooms.id, bed.roomId)).limit(1);
    if (room[0]) {
      const allRooms = await db.select({ sharingType: rooms.sharingType }).from(rooms).where(eq(rooms.pgId, room[0].pgId));
      const totalBeds = allRooms.reduce((sum, r) => sum + r.sharingType, 0);
      await db.update(pgs).set({ totalBeds, updatedAt: new Date() }).where(eq(pgs.id, room[0].pgId));
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete bed error:", error);
    res.status(500).json({ error: "Failed to delete bed" });
  }
});

export default router;
