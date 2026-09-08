import { Router, Request, Response } from "express";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { createDb, tenants, beds, rooms, tenantHistory, rentPayments, rentPaymentTransactions } from "../db";

const router = Router();

// POST /api/tenants — Check-in a new tenant
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      bedId,
      pgId,
      name,
      phone,
      altPhone,
      emergencyContact,
      emergencyRelation,
      joiningDate,
      rentAmount,
      advanceAmount,
      paymentMode,
      photoUrl,
      idPhotoUrl,
    } = req.body as {
      bedId: string;
      pgId: string;
      name: string;
      phone: string;
      altPhone?: string;
      emergencyContact?: string;
      emergencyRelation?: string;
      joiningDate: string;
      rentAmount: number;
      advanceAmount: number;
      paymentMode: string;
      photoUrl?: string;
      idPhotoUrl?: string;
    };

    if (!bedId || !pgId || !name?.trim() || !phone?.trim()) {
      res.status(400).json({ error: "bedId, pgId, name, and phone are required" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);

    // Verify bed is not already occupied
    const bedResult = await db.select().from(beds).where(eq(beds.id, bedId)).limit(1);
    if (!bedResult[0]) { res.status(404).json({ error: "Bed not found" }); return; }
    if (bedResult[0].isOccupied) { res.status(409).json({ error: "Bed is already occupied" }); return; }

    // Create tenant
    const [tenant] = await db.insert(tenants).values({
      pgId,
      bedId,
      name: name.trim(),
      phone: phone.trim(),
      altPhone: altPhone?.trim() || null,
      emergencyContact: emergencyContact?.trim() || null,
      emergencyRelation: emergencyRelation?.trim() || null,
      joiningDate: new Date(joiningDate || Date.now()),
      rentAmount: rentAmount || 0,
      advanceAmount: advanceAmount || 0,
      paymentMode: paymentMode || "cash",
      photoUrl: photoUrl || null,
      idPhotoUrl: idPhotoUrl || null,
      status: "active",
    }).returning();

    // Mark bed as occupied
    await db.update(beds).set({ isOccupied: true }).where(eq(beds.id, bedId));

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        phone: tenant.phone,
        joiningDate: tenant.joiningDate,
        bedId: tenant.bedId,
        pgId: tenant.pgId,
      },
      message: "Tenant checked in successfully",
    });
  } catch (error) {
    console.error("Tenant check-in error:", error);
    res.status(500).json({ error: "Check-in failed" });
  }
});

// GET /api/tenants?pgId=xxx — list all tenants for a PG
router.get("/", async (req: Request, res: Response) => {
  try {
    const { pgId } = req.query as { pgId: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    const db = createDb(process.env.DATABASE_URL!);
    const result = await db.select().from(tenants)
      .where(and(eq(tenants.pgId, pgId), eq(tenants.status, "active")));

    res.json({ tenants: result });
  } catch {
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// GET /api/tenants/search?pgId=xxx&q=name_or_phone — search all tenants (active + inactive)
router.get("/search", async (req: Request, res: Response) => {
  try {
    const { pgId, q } = req.query as { pgId: string; q: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    const db = createDb(process.env.DATABASE_URL!);
    const query = (q || "").trim();

    let results;
    if (query) {
      results = await db.select().from(tenants).where(
        and(
          eq(tenants.pgId, pgId),
          or(
            ilike(tenants.name, `%${query}%`),
            ilike(tenants.phone, `%${query}%`)
          )
        )
      );
    } else {
      // Return all when query is empty
      results = await db.select().from(tenants).where(eq(tenants.pgId, pgId));
    }

    // For each tenant, fetch their history
    const tenantIds = results.map((t) => t.id);
    let historyMap: Record<string, typeof tenantHistory.$inferSelect[]> = {};
    if (tenantIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const hist = await db.select().from(tenantHistory)
        .where(inArray(tenantHistory.tenantId, tenantIds))
        .orderBy(tenantHistory.createdAt);
      for (const h of hist) {
        if (!historyMap[h.tenantId]) historyMap[h.tenantId] = [];
        historyMap[h.tenantId].push(h);
      }
    }

    const enriched = results.map((t) => ({ ...t, history: historyMap[t.id] || [] }));
    res.json({ tenants: enriched });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

// GET /api/tenants/:id — full tenant profile (for dedicated tenant page)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = createDb(process.env.DATABASE_URL!);

    // Tenant record
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

    // Bed + Room
    let bed = null, room = null;
    if (tenant.bedId) {
      const [bedRow] = await db.select().from(beds).where(eq(beds.id, tenant.bedId)).limit(1);
      if (bedRow) {
        bed = bedRow;
        const [roomRow] = await db.select().from(rooms).where(eq(rooms.id, bedRow.roomId)).limit(1);
        room = roomRow || null;
      }
    }

    // History events
    const history = await db.select().from(tenantHistory)
      .where(eq(tenantHistory.tenantId, id))
      .orderBy(desc(tenantHistory.createdAt));

    // All rent payment records with transactions
    const rentRecords = await db.select().from(rentPayments)
      .where(eq(rentPayments.tenantId, id))
      .orderBy(desc(rentPayments.month));

    const { inArray } = await import("drizzle-orm");
    let txnsByRentId: Record<string, typeof rentPaymentTransactions.$inferSelect[]> = {};
    if (rentRecords.length > 0) {
      const rentIds = rentRecords.map((r) => r.id);
      const txns = await db.select().from(rentPaymentTransactions)
        .where(inArray(rentPaymentTransactions.rentPaymentId, rentIds))
        .orderBy(desc(rentPaymentTransactions.createdAt));
      for (const t of txns) {
        if (!txnsByRentId[t.rentPaymentId]) txnsByRentId[t.rentPaymentId] = [];
        txnsByRentId[t.rentPaymentId].push(t);
      }
    }

    const rentWithTxns = rentRecords.map((r) => ({
      ...r,
      transactions: txnsByRentId[r.id] || [],
    }));

    res.json({ tenant, bed, room, history, rentRecords: rentWithTxns });
  } catch (error) {
    console.error("Tenant profile error:", error);
    res.status(500).json({ error: "Failed to load tenant profile" });
  }
});


// GET /api/tenants/room-history/:roomId — past tenants of a room
router.get("/room-history/:roomId", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const db = createDb(process.env.DATABASE_URL!);

    // Get all bed IDs for this room
    const roomBeds = await db.select({ id: beds.id })
      .from(beds).where(eq(beds.roomId, roomId));
    const bedIds = roomBeds.map((b) => b.id);
    if (bedIds.length === 0) { res.json({ tenants: [] }); return; }

    const { inArray } = await import("drizzle-orm");

    // Get all inactive tenants whose last bed was in this room
    const past = await db.select().from(tenants)
      .where(and(
        eq(tenants.status, "inactive"),
        inArray(tenants.bedId, bedIds)
      ))
      .orderBy(tenants.leavingDate);

    // Also check move history for tenants who moved OUT of this room
    const moveHistory = await db.select().from(tenantHistory)
      .where(and(
        eq(tenantHistory.eventType, "move"),
        inArray(tenantHistory.fromBedId, bedIds)
      ))
      .orderBy(tenantHistory.createdAt);

    res.json({ past, moveHistory });
  } catch (error) {
    console.error("Room history error:", error);
    res.status(500).json({ error: "Failed to fetch room history" });
  }
});

// POST /api/tenants/:id/move — Move tenant to a different bed (zero data loss)
router.post("/:id/move", async (req: Request, res: Response) => {
  try {
    const { id: tenantId } = req.params;
    const { targetBedId } = req.body as { targetBedId: string };

    if (!targetBedId) { res.status(400).json({ error: "targetBedId required" }); return; }

    const db = createDb(process.env.DATABASE_URL!);

    // 1. Verify tenant exists and is active
    const tenantResult = await db.select().from(tenants).where(
      and(eq(tenants.id, tenantId), eq(tenants.status, "active"))
    ).limit(1);
    if (!tenantResult[0]) { res.status(404).json({ error: "Tenant not found" }); return; }
    const tenant = tenantResult[0];

    // 2. Verify target bed is empty
    const targetBed = await db.select().from(beds).where(eq(beds.id, targetBedId)).limit(1);
    if (!targetBed[0]) { res.status(404).json({ error: "Target bed not found" }); return; }
    if (targetBed[0].isOccupied) { res.status(409).json({ error: "Target bed is already occupied" }); return; }

    // 3. Get room info for history labels
    const fromRoom = tenant.bedId
      ? await db.select({ roomNumber: rooms.roomNumber, floor: rooms.floor })
          .from(rooms).innerJoin(beds, eq(beds.roomId, rooms.id))
          .where(eq(beds.id, tenant.bedId)).limit(1)
      : [];
    const toRoom = await db.select({ roomNumber: rooms.roomNumber, floor: rooms.floor })
      .from(rooms).innerJoin(beds, eq(beds.roomId, rooms.id))
      .where(eq(beds.id, targetBedId)).limit(1);

    const fromLabel = fromRoom[0] ? `Room ${fromRoom[0].roomNumber} (Floor ${fromRoom[0].floor})` : "Unknown";
    const toLabel = toRoom[0] ? `Room ${toRoom[0].roomNumber} (Floor ${toRoom[0].floor})` : "Unknown";

    // 4. Free old bed (if any)
    if (tenant.bedId) {
      await db.update(beds).set({ isOccupied: false }).where(eq(beds.id, tenant.bedId));
    }

    // 5. Occupy new bed
    await db.update(beds).set({ isOccupied: true }).where(eq(beds.id, targetBedId));

    // 6. Update tenant's bedId
    await db.update(tenants).set({ bedId: targetBedId }).where(eq(tenants.id, tenantId));

    // 7. Log history
    await db.insert(tenantHistory).values({
      tenantId,
      eventType: "move",
      fromBedId: tenant.bedId || undefined,
      fromRoom: fromLabel,
      toBedId: targetBedId,
      toRoom: toLabel,
      note: `Moved from ${fromLabel} to ${toLabel}`,
    });

    res.json({
      success: true,
      message: `${tenant.name} moved from ${fromLabel} to ${toLabel}`,
      from: fromLabel,
      to: toLabel,
    });
  } catch (error) {
    console.error("Move tenant error:", error);
    res.status(500).json({ error: "Move failed" });
  }
});

// GET /api/tenants/:id/history
router.get("/:id/history", async (req: Request, res: Response) => {
  try {
    const { id: tenantId } = req.params;
    const db = createDb(process.env.DATABASE_URL!);
    const history = await db.select().from(tenantHistory)
      .where(eq(tenantHistory.tenantId, tenantId))
      .orderBy(tenantHistory.createdAt);
    res.json({ history });
  } catch {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
