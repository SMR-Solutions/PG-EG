import { Router, Request, Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { createDb, pgs, rooms, beds, tenants, owners, rentPayments, tenantHistory } from "../db";
import { requireAuth, verifyPgOwnership } from "../middleware/auth";

const router = Router();

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/dashboard?pgId=xxx
// Requires: Authorization: Bearer <jwt>
// Enforces: pg.ownerId === token.ownerId
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId } = req.query as { pgId: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    // ── Ownership check (single query, both id + ownerId) ──────────
    const pg = await verifyPgOwnership(pgId, req.owner!.ownerId, res);
    if (!pg) return; // verifyPgOwnership already sent 403

    const db = createDb(process.env.DATABASE_URL!);
    const month = currentMonth();

    // Fetch owner
    const ownerResult = await db.select({ name: owners.name, phone: owners.phone })
      .from(owners).where(eq(owners.id, pg.ownerId)).limit(1);

    // Fetch all rooms
    const roomList = await db.select().from(rooms).where(eq(rooms.pgId, pgId));

    // Fetch all beds
    let bedList: typeof beds.$inferSelect[] = [];
    if (roomList.length > 0) {
      bedList = await db.select().from(beds)
        .where(inArray(beds.roomId, roomList.map((r) => r.id)));
    }

    // Fetch all active tenants
    const tenantList = await db.select().from(tenants)
      .where(and(eq(tenants.pgId, pgId), eq(tenants.status, "active")));

    // Auto-generate pending rent records for any tenant missing one this month
    if (tenantList.length > 0) {
      const tenantIds = tenantList.map((t) => t.id);
      const existing = await db.select({ tenantId: rentPayments.tenantId }).from(rentPayments)
        .where(and(
          eq(rentPayments.pgId, pgId),
          eq(rentPayments.month, month),
          inArray(rentPayments.tenantId, tenantIds)
        ));
      const existingSet = new Set(existing.map((r) => r.tenantId));
      const missing = tenantList.filter((t) => !existingSet.has(t.id) && t.bedId);
      if (missing.length > 0) {
        await db.insert(rentPayments).values(
          missing.map((t) => ({
            tenantId: t.id, pgId, bedId: t.bedId!,
            month, amount: t.rentAmount || 0, status: "pending",
          }))
        );
      }
    }

    // Fetch current month rent statuses
    const rentRecords = tenantList.length > 0
      ? await db.select().from(rentPayments).where(
          and(eq(rentPayments.pgId, pgId), eq(rentPayments.month, month),
            inArray(rentPayments.tenantId, tenantList.map((t) => t.id)))
        )
      : [];

    const rentByTenantId = new Map(rentRecords.map((r) => [r.tenantId, r]));

    // Assemble rooms → beds → tenants
    const roomsWithData = roomList.map((room) => {
      const roomBeds = bedList
        .filter((b) => b.roomId === room.id)
        .sort((a, b) => a.bedNumber - b.bedNumber)
        .map((bed) => {
          const tenant = tenantList.find((t) => t.bedId === bed.id);
          const rent = tenant ? rentByTenantId.get(tenant.id) : undefined;
          return {
            ...bed,
            tenant: tenant
              ? {
                  id: tenant.id,
                  name: tenant.name,
                  phone: tenant.phone,
                  altPhone: tenant.altPhone,
                  emergencyContact: tenant.emergencyContact,
                  emergencyRelation: tenant.emergencyRelation,
                  joiningDate: tenant.joiningDate,
                  photoUrl: tenant.photoUrl,
                  idPhotoUrl: tenant.idPhotoUrl,
                  advanceAmount: tenant.advanceAmount,
                  rentAmount: tenant.rentAmount,
                  rent: rent
                    ? {
                        id: rent.id,
                        status: rent.status,
                        amount: rent.amount,
                        paidAmount: rent.paidAmount ?? 0,
                        paymentMode: rent.paymentMode,
                        paidAt: rent.paidAt,
                      }
                    : null,
                }
              : null,
          };
        });
      return { ...room, beds: roomBeds };
    });

    res.json({
      pg: {
        ...pg,
        sharings: JSON.parse(pg.sharings),
        managerName: pg.managerName || null,
        managerPhone: pg.managerPhone || null,
        owner: ownerResult[0] || null,
      },
      rooms: roomsWithData,
      currentMonth: month,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// PATCH /api/dashboard/beds/:bedId/checkout
// Requires auth; verifies the bed belongs to a PG owned by the caller
router.patch("/beds/:bedId/checkout", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = createDb(process.env.DATABASE_URL!);
    const { bedId } = req.params;
    const { depositDeduction = 0, refundMode = "cash" } = req.body as {
      depositDeduction?: number;
      refundMode?: string;
    };

    // Resolve bed → room → pg → ownership
    const bedRow = await db.select().from(beds).where(eq(beds.id, bedId)).limit(1);
    if (!bedRow[0]) { res.status(404).json({ error: "Bed not found" }); return; }

    const roomRow = await db.select().from(rooms).where(eq(rooms.id, bedRow[0].roomId)).limit(1);
    if (!roomRow[0]) { res.status(404).json({ error: "Room not found" }); return; }

    const pg = await verifyPgOwnership(roomRow[0].pgId, req.owner!.ownerId, res);
    if (!pg) return;

    // Fetch the active tenant NOW (before processing) so we can validate deduction
    const tenantForValidation = await db.select().from(tenants)
      .where(and(eq(tenants.bedId, bedId), eq(tenants.status, "active"))).limit(1);

    if (tenantForValidation[0]) {
      const deposit = tenantForValidation[0].advanceAmount ?? 0;
      if (depositDeduction < 0) {
        res.status(400).json({ error: "Deduction cannot be negative" });
        return;
      }
      if (depositDeduction > deposit) {
        res.status(400).json({
          error: `Deduction of ₹${depositDeduction.toLocaleString("en-IN")} exceeds the initial deposit of ₹${deposit.toLocaleString("en-IN")}`,
        });
        return;
      }
    }

    const tenantResult = await db.select().from(tenants)
      .where(and(eq(tenants.bedId, bedId), eq(tenants.status, "active"))).limit(1);

    if (tenantResult[0]) {
      const tenant = tenantResult[0];

      const roomResult = await db.select({ roomNumber: rooms.roomNumber, floor: rooms.floor })
        .from(rooms).innerJoin(beds, eq(beds.roomId, rooms.id))
        .where(eq(beds.id, bedId)).limit(1);
      const roomLabel = roomResult[0]
        ? `Room ${roomResult[0].roomNumber} (Floor ${roomResult[0].floor})`
        : "Unknown Room";

      // Refund must never be negative: max(0, deposit - deduction)
      const deposit = tenant.advanceAmount ?? 0;
      const refundAmount = Math.max(0, deposit - depositDeduction);

      await db.update(tenants).set({
        status: "inactive",
        leavingDate: new Date(),
        depositDeduction: depositDeduction || 0,
        refundMode,
      }).where(eq(tenants.id, tenant.id));

      await db.insert(tenantHistory).values({
        tenantId: tenant.id,
        eventType: "check_out",
        fromBedId: bedId,
        fromRoom: roomLabel,
        note: `Checked out from ${roomLabel}. Deposit: ₹${deposit}, Deduction: ₹${depositDeduction}, Refund: ₹${refundAmount}. Refund via ${refundMode.toUpperCase()}.`,
      });
    }

    await db.update(beds).set({ isOccupied: false }).where(eq(beds.id, bedId));
    res.json({ success: true });
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ error: "Checkout failed" });
  }
});

export default router;
