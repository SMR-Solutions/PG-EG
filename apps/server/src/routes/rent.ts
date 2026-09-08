import { Router, Request, Response } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import { createDb, rentPayments, rentPaymentTransactions, tenants, beds } from "../db";

const router = Router();

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/rent?pgId=xxx&month=2026-09
router.get("/", async (req: Request, res: Response) => {
  try {
    const { pgId, month } = req.query as { pgId: string; month?: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }
    const db = createDb(process.env.DATABASE_URL!);
    const m = month || currentMonth();
    const records = await db.select().from(rentPayments)
      .where(and(eq(rentPayments.pgId, pgId), eq(rentPayments.month, m)));
    res.json({ month: m, payments: records });
  } catch {
    res.status(500).json({ error: "Failed to fetch rent records" });
  }
});

// POST /api/rent/generate?pgId=xxx
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { pgId } = req.query as { pgId: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }
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
          month, amount: t.rentAmount || 0,
          paidAmount: 0, status: "pending",
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
router.patch("/:id/pay", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentMode = "cash", amount } = req.body as { paymentMode?: string; amount?: number };

    const db = createDb(process.env.DATABASE_URL!);

    // Fetch current record
    const [record] = await db.select().from(rentPayments).where(eq(rentPayments.id, id)).limit(1);
    if (!record) { res.status(404).json({ error: "Record not found" }); return; }
    if (record.status === "paid") { res.status(400).json({ error: "Already fully paid" }); return; }

    const payingNow = Math.max(1, amount ?? record.amount);
    const newPaidAmount = Math.min((record.paidAmount || 0) + payingNow, record.amount);
    const isFullyPaid = newPaidAmount >= record.amount;

    // Update rent_payments record
    const [updated] = await db.update(rentPayments)
      .set({
        paidAmount: newPaidAmount,
        status: isFullyPaid ? "paid" : "partial",
        paymentMode,
        paidAt: isFullyPaid ? new Date() : null,
      })
      .where(eq(rentPayments.id, id))
      .returning();

    // Insert transaction record
    await db.insert(rentPaymentTransactions).values({
      rentPaymentId: id,
      tenantId: record.tenantId,
      pgId: record.pgId,
      amount: payingNow,
      paymentMode,
      note: isFullyPaid ? "Full payment" : `Partial (${newPaidAmount}/${record.amount})`,
    });

    res.json({
      payment: updated,
      paidNow: payingNow,
      totalPaid: newPaidAmount,
      remaining: record.amount - newPaidAmount,
      isFullyPaid,
    });
  } catch (error) {
    console.error("Rent pay error:", error);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

// GET /api/rent/:id/transactions — get payment history for a rent record
router.get("/:id/transactions", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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
