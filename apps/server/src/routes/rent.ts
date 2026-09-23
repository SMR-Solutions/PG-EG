import { Router, Request, Response } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import { createDb, rentPayments, rentPaymentTransactions, tenants, pgs, rooms, beds } from "../db";
import { requireAuth, verifyPgOwnership } from "../middleware/auth";

const router = Router();

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Helper: verify rent record belongs to an owned PG ────────────
async function verifyRentOwnership(
  rentId: string,
  ownerId: string,
  res: Response
): Promise<typeof rentPayments.$inferSelect | null> {
  const db = createDb(process.env.DATABASE_URL!);
  const [record] = await db.select().from(rentPayments).where(eq(rentPayments.id, rentId)).limit(1);
  if (!record) { res.status(404).json({ error: "Record not found" }); return null; }
  const pg = await verifyPgOwnership(record.pgId, ownerId, res);
  if (!pg) return null;
  return record;
}

// GET /api/rent?pgId=xxx&month=2026-09
// Returns enriched payments: each record includes tenant name/photo and room floor/number
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId, month } = req.query as { pgId: string; month?: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    const pg = await verifyPgOwnership(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const db = createDb(process.env.DATABASE_URL!);
    const m = month || currentMonth();

    // Join rentPayments → tenants → beds → rooms
    const rows = await db
      .select({
        id: rentPayments.id,
        tenantId: rentPayments.tenantId,
        bedId: rentPayments.bedId,
        month: rentPayments.month,
        amount: rentPayments.amount,
        paidAmount: rentPayments.paidAmount,
        status: rentPayments.status,
        paymentMode: rentPayments.paymentMode,
        paidAt: rentPayments.paidAt,
        createdAt: rentPayments.createdAt,
        // tenant fields
        tenantName: tenants.name,
        tenantPhone: tenants.phone,
        tenantPhoto: tenants.photoUrl,
        // room fields (via beds → rooms)
        roomNumber: rooms.roomNumber,
        floor: rooms.floor,
      })
      .from(rentPayments)
      .leftJoin(tenants, eq(rentPayments.tenantId, tenants.id))
      .leftJoin(beds, eq(rentPayments.bedId, beds.id))
      .leftJoin(rooms, eq(beds.roomId, rooms.id))
      .where(and(eq(rentPayments.pgId, pgId), eq(rentPayments.month, m)));

    res.json({ month: m, payments: rows });
  } catch (err) {
    console.error("Rent fetch error:", err);
    res.status(500).json({ error: "Failed to fetch rent records" });
  }
});


// POST /api/rent/generate?pgId=xxx
router.post("/generate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId } = req.query as { pgId: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    const pg = await verifyPgOwnership(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const db = createDb(process.env.DATABASE_URL!);
    const month = currentMonth();
    const activeTenants = await db.select().from(tenants)
      .where(and(eq(tenants.pgId, pgId), eq(tenants.status, "active")));
    if (activeTenants.length === 0) { res.json({ created: 0, month }); return; }
    const tenantIds = activeTenants.map((t) => t.id);
    const existing = await db.select({ tenantId: rentPayments.tenantId }).from(rentPayments)
      .where(and(eq(rentPayments.pgId, pgId), eq(rentPayments.month, month),
        inArray(rentPayments.tenantId, tenantIds)));
    const existingIds = new Set(existing.map((r) => r.tenantId));
    const missing = activeTenants.filter((t) => !existingIds.has(t.id) && t.bedId);
    let created = 0;
    if (missing.length > 0) {
      await db.insert(rentPayments).values(
        missing.map((t) => ({
          tenantId: t.id, pgId, bedId: t.bedId!,
          month, amount: t.rentAmount || 0, paidAmount: 0, status: "pending",
        }))
      );
      created = missing.length;
    }
    res.json({ created, month, total: activeTenants.length });
  } catch (error) {
    console.error("Rent generate error:", error);
    res.status(500).json({ error: "Failed to generate rent records" });
  }
});

// PATCH /api/rent/:id/pay — partial or full payment
router.patch("/:id/pay", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentMode = "cash", amount } = req.body as { paymentMode?: string; amount?: number };

    const record = await verifyRentOwnership(id, req.owner!.ownerId, res);
    if (!record) return;
    if (record.status === "paid") { res.status(400).json({ error: "Already fully paid" }); return; }

    const db = createDb(process.env.DATABASE_URL!);

    // ── Strict payment validation ──────────────────────────────────────
    const rawAmount = typeof amount === "number" ? amount : record.amount;
    const alreadyPaid = record.paidAmount || 0;
    const remaining = record.amount - alreadyPaid;

    if (rawAmount == null || !Number.isFinite(rawAmount) || rawAmount <= 0) {
      res.status(400).json({ error: "Payment amount must be greater than ₹0" });
      return;
    }
    if (!Number.isInteger(rawAmount)) {
      res.status(400).json({ error: "Payment amount must be a whole rupee amount (no paise/decimals)" });
      return;
    }
    const payingNow = rawAmount;
    if (payingNow > remaining) {
      res.status(400).json({
        error: `Payment of ₹${payingNow.toLocaleString("en-IN")} exceeds the remaining balance of ₹${remaining.toLocaleString("en-IN")}`,
      });
      return;
    }

    const newPaidAmount = alreadyPaid + payingNow;
    // Mark fully paid only when the payment amount exactly clears the balance
    const isFullyPaid = newPaidAmount === record.amount;

    const [updated] = await db.update(rentPayments)
      .set({ paidAmount: newPaidAmount, status: isFullyPaid ? "paid" : "partial", paymentMode, paidAt: isFullyPaid ? new Date() : null })
      .where(eq(rentPayments.id, id)).returning();

    await db.insert(rentPaymentTransactions).values({
      rentPaymentId: id, tenantId: record.tenantId, pgId: record.pgId,
      amount: payingNow, paymentMode,
      note: isFullyPaid ? "Full payment" : `Partial payment (₹${newPaidAmount.toLocaleString("en-IN")} of ₹${record.amount.toLocaleString("en-IN")})`,
    });

    res.json({ payment: updated, paidNow: payingNow, totalPaid: newPaidAmount, remaining: record.amount - newPaidAmount, isFullyPaid });
  } catch (error) {
    console.error("Rent pay error:", error);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

// GET /api/rent/:id/transactions
router.get("/:id/transactions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const record = await verifyRentOwnership(id, req.owner!.ownerId, res);
    if (!record) return;

    const db = createDb(process.env.DATABASE_URL!);
    const txns = await db.select().from(rentPaymentTransactions)
      .where(eq(rentPaymentTransactions.rentPaymentId, id))
      .orderBy(desc(rentPaymentTransactions.createdAt));
    res.json({ transactions: txns });
  } catch {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

export default router;
