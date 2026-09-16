import { Router, Request, Response } from "express";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { createDb, tenants, beds, rooms, pgs, tenantHistory, rentPayments, rentPaymentTransactions } from "../db";
import { requireAuth, verifyPgOwnership } from "../middleware/auth";

const router = Router();

// ─── Helper: verify tenant belongs to a PG owned by caller ────────
async function verifyTenantOwnership(
  tenantId: string,
  ownerId: string,
  res: Response
): Promise<typeof tenants.$inferSelect | null> {
  const db = createDb(process.env.DATABASE_URL!);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return null; }

  // Confirm the PG that this tenant belongs to is owned by the caller
  const pg = await verifyPgOwnership(tenant.pgId, ownerId, res);
  if (!pg) return null; // verifyPgOwnership already sent 403
  return tenant;
}

// POST /api/tenants — Check-in a new tenant
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      bedId, pgId, name, phone, altPhone, emergencyContact, emergencyRelation,
      joiningDate, rentAmount, advanceAmount, paymentMode, photoUrl, idPhotoUrl,
    } = req.body as {
      bedId: string; pgId: string; name: string; phone: string;
      altPhone?: string; emergencyContact?: string; emergencyRelation?: string;
      joiningDate: string; rentAmount: number; advanceAmount: number;
      paymentMode: string; photoUrl?: string; idPhotoUrl?: string;
    };

    if (!bedId || !pgId || !name?.trim() || !phone?.trim()) {
      res.status(400).json({ error: "bedId, pgId, name, and phone are required" });
      return;
    }

    // ── Monetary input validation ──────────────────────────────────────
    const rent = rentAmount ?? 0;
    const deposit = advanceAmount ?? 0;
    if (!Number.isInteger(rent) || rent < 0) {
      res.status(400).json({ error: "Monthly rent must be a whole rupee amount (no paise/decimals)" });
      return;
    }
    if (!Number.isInteger(deposit) || deposit < 0) {
      res.status(400).json({ error: "Deposit must be a whole rupee amount (no paise/decimals)" });
      return;
    }

    // Caller must own the PG they are checking a tenant into
    const pg = await verifyPgOwnership(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const db = createDb(process.env.DATABASE_URL!);

    const bedResult = await db.select().from(beds).where(eq(beds.id, bedId)).limit(1);
    if (!bedResult[0]) { res.status(404).json({ error: "Bed not found" }); return; }
    if (bedResult[0].isOccupied) { res.status(409).json({ error: "Bed is already occupied" }); return; }

    const [tenant] = await db.insert(tenants).values({
      pgId, bedId,
      name: name.trim(), phone: phone.trim(),
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

    await db.update(beds).set({ isOccupied: true }).where(eq(beds.id, bedId));

    res.json({
      tenant: { id: tenant.id, name: tenant.name, phone: tenant.phone, joiningDate: tenant.joiningDate, bedId: tenant.bedId, pgId: tenant.pgId },
      message: "Tenant checked in successfully",
    });
  } catch (error) {
    console.error("Tenant check-in error:", error);
    res.status(500).json({ error: "Check-in failed" });
  }
});

// GET /api/tenants?pgId=xxx — list active tenants for a PG
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId } = req.query as { pgId: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    const pg = await verifyPgOwnership(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const db = createDb(process.env.DATABASE_URL!);
    const result = await db.select().from(tenants)
      .where(and(eq(tenants.pgId, pgId), eq(tenants.status, "active")));
    res.json({ tenants: result });
  } catch {
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// GET /api/tenants/search?pgId=xxx&q=name_or_phone
router.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId, q } = req.query as { pgId: string; q: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    const pg = await verifyPgOwnership(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const db = createDb(process.env.DATABASE_URL!);
    const query = (q || "").trim();

    let results;
    if (query) {
      results = await db.select().from(tenants).where(
        and(eq(tenants.pgId, pgId), or(ilike(tenants.name, `%${query}%`), ilike(tenants.phone, `%${query}%`)))
      );
    } else {
      results = await db.select().from(tenants).where(eq(tenants.pgId, pgId));
    }

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

// GET /api/tenants/:id — full tenant profile
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenant = await verifyTenantOwnership(id, req.owner!.ownerId, res);
    if (!tenant) return;

    const db = createDb(process.env.DATABASE_URL!);

    let bed = null, room = null;
    if (tenant.bedId) {
      const [bedRow] = await db.select().from(beds).where(eq(beds.id, tenant.bedId)).limit(1);
      if (bedRow) {
        bed = bedRow;
        const [roomRow] = await db.select().from(rooms).where(eq(rooms.id, bedRow.roomId)).limit(1);
        room = roomRow || null;
      }
    }

    const history = await db.select().from(tenantHistory)
      .where(eq(tenantHistory.tenantId, id))
      .orderBy(desc(tenantHistory.createdAt));

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

    const rentWithTxns = rentRecords.map((r) => ({ ...r, transactions: txnsByRentId[r.id] || [] }));
    res.json({ tenant, bed, room, history, rentRecords: rentWithTxns });
  } catch (error) {
    console.error("Tenant profile error:", error);
    res.status(500).json({ error: "Failed to load tenant profile" });
  }
});

// GET /api/tenants/room-history/:roomId
router.get("/room-history/:roomId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const db = createDb(process.env.DATABASE_URL!);

    // Resolve room → pg → ownership
    const [roomRow] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!roomRow) { res.status(404).json({ error: "Room not found" }); return; }
    const pg = await verifyPgOwnership(roomRow.pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const roomBeds = await db.select({ id: beds.id }).from(beds).where(eq(beds.roomId, roomId));
    const bedIds = roomBeds.map((b) => b.id);
    if (bedIds.length === 0) { res.json({ tenants: [] }); return; }

    const { inArray } = await import("drizzle-orm");
    const past = await db.select().from(tenants)
      .where(and(eq(tenants.status, "inactive"), inArray(tenants.bedId, bedIds)))
      .orderBy(tenants.leavingDate);

    const moveHistory = await db.select().from(tenantHistory)
      .where(and(eq(tenantHistory.eventType, "move"), inArray(tenantHistory.fromBedId, bedIds)))
      .orderBy(tenantHistory.createdAt);

    res.json({ past, moveHistory });
  } catch (error) {
    console.error("Room history error:", error);
    res.status(500).json({ error: "Failed to fetch room history" });
  }
});

// POST /api/tenants/:id/move
router.post("/:id/move", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: tenantId } = req.params;
    const { targetBedId } = req.body as { targetBedId: string };
    if (!targetBedId) { res.status(400).json({ error: "targetBedId required" }); return; }

    const tenant = await verifyTenantOwnership(tenantId, req.owner!.ownerId, res);
    if (!tenant) return;
    if (tenant.status !== "active") { res.status(404).json({ error: "Tenant not found" }); return; }

    const db = createDb(process.env.DATABASE_URL!);

    // Verify target bed exists and is in a PG owned by caller
    const targetBedRow = await db.select().from(beds).where(eq(beds.id, targetBedId)).limit(1);
    if (!targetBedRow[0]) { res.status(404).json({ error: "Target bed not found" }); return; }
    if (targetBedRow[0].isOccupied) { res.status(409).json({ error: "Target bed is already occupied" }); return; }

    const targetRoomRow = await db.select().from(rooms).where(eq(rooms.id, targetBedRow[0].roomId)).limit(1);
    if (!targetRoomRow[0]) { res.status(404).json({ error: "Target room not found" }); return; }
    const targetPg = await verifyPgOwnership(targetRoomRow[0].pgId, req.owner!.ownerId, res);
    if (!targetPg) return;

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

    if (tenant.bedId) {
      await db.update(beds).set({ isOccupied: false }).where(eq(beds.id, tenant.bedId));
    }
    await db.update(beds).set({ isOccupied: true }).where(eq(beds.id, targetBedId));
    await db.update(tenants).set({ bedId: targetBedId }).where(eq(tenants.id, tenantId));
    await db.insert(tenantHistory).values({
      tenantId, eventType: "move",
      fromBedId: tenant.bedId || undefined,
      fromRoom: fromLabel,
      toBedId: targetBedId,
      toRoom: toLabel,
      note: `Moved from ${fromLabel} to ${toLabel}`,
    });

    res.json({ success: true, message: `${tenant.name} moved from ${fromLabel} to ${toLabel}`, from: fromLabel, to: toLabel });
  } catch (error) {
    console.error("Move tenant error:", error);
    res.status(500).json({ error: "Move failed" });
  }
});

// GET /api/tenants/:id/history
router.get("/:id/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: tenantId } = req.params;
    const tenant = await verifyTenantOwnership(tenantId, req.owner!.ownerId, res);
    if (!tenant) return;

    const db = createDb(process.env.DATABASE_URL!);
    const history = await db.select().from(tenantHistory)
      .where(eq(tenantHistory.tenantId, tenantId))
      .orderBy(tenantHistory.createdAt);
    res.json({ history });
  } catch {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// PATCH /api/tenants/:id/contact — update contact details
router.patch("/:id/contact", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { phone, altPhone, emergencyContact, emergencyRelation, idPhotoUrl } = req.body as {
      phone?: string;
      altPhone?: string | null;
      emergencyContact?: string | null;
      emergencyRelation?: string | null;
      idPhotoUrl?: string | null;
    };

    const tenant = await verifyTenantOwnership(id, req.owner!.ownerId, res);
    if (!tenant) return;

    if (phone !== undefined) {
      const clean = phone.replace(/\D/g, "").slice(-10);
      if (clean.length !== 10) {
        res.status(400).json({ error: "Mobile number must be 10 digits" });
        return;
      }
    }

    const db = createDb(process.env.DATABASE_URL!);
    const updates: Record<string, unknown> = {};
    if (phone !== undefined) updates.phone = phone.replace(/\D/g, "").slice(-10);
    if ("altPhone" in req.body) updates.altPhone = altPhone?.trim() || null;
    if ("emergencyContact" in req.body) updates.emergencyContact = emergencyContact?.trim() || null;
    if ("emergencyRelation" in req.body) updates.emergencyRelation = emergencyRelation?.trim() || null;
    if ("idPhotoUrl" in req.body) updates.idPhotoUrl = idPhotoUrl || null;

    const [updated] = await db.update(tenants).set(updates).where(eq(tenants.id, id)).returning();
    res.json({ tenant: updated });
  } catch (error) {
    console.error("Tenant contact update error:", error);
    res.status(500).json({ error: "Failed to update tenant details" });
  }
});

export default router;
