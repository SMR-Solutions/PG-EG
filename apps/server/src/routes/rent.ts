import { Router, Request, Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { createDb, rentPayments, tenants, beds } from "../db";

const router = Router();

/** Returns current month string in "YYYY-MM" format */
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
// Lazily creates "pending" records for all active tenants that don't have one yet this month
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { pgId } = req.query as { pgId: string };
    if (!pgId) { res.status(400).json({ error: "pgId required" }); return; }

    const db = createDb(process.env.DATABASE_URL!);
    const month = currentMonth();

    // Get all active tenants for this PG
    const activeTenants = await db.select().from(tenants)
      .where(and(eq(tenants.pgId, pgId), eq(tenants.status, "active")));

    if (activeTenants.length === 0) {
      res.json({ created: 0, month });
      return;
    }

    // Get existing payment records this month
    const tenantIds = activeTenants.map((t) => t.id);
    const existing = await db.select({ tenantId: rentPayments.tenantId }).from(rentPayments)
      .where(and(eq(rentPayments.pgId, pgId), eq(rentPayments.month, month),
        inArray(rentPayments.tenantId, tenantIds)));

    const existingIds = new Set(existing.map((r) => r.tenantId));

    // Insert missing records
    const missing = activeTenants.filter((t) => !existingIds.has(t.id) && t.bedId);
    let created = 0;

    if (missing.length > 0) {
      await db.insert(rentPayments).values(
        missing.map((t) => ({
          tenantId: t.id,
          pgId,
          bedId: t.bedId!,
          month,
          amount: t.rentAmount || 0,
          status: "pending",
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

// PATCH /api/rent/:id/pay — mark a rent record as paid
router.patch("/:id/pay", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentMode = "cash", amount } = req.body as { paymentMode?: string; amount?: number };

    const db = createDb(process.env.DATABASE_URL!);

    const [updated] = await db.update(rentPayments)
      .set({
        status: "paid",
        paymentMode,
        amount: amount ?? undefined,
        paidAt: new Date(),
      })
      .where(eq(rentPayments.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Record not found" }); return; }

    res.json({ payment: updated });
  } catch (error) {
    console.error("Rent pay error:", error);
    res.status(500).json({ error: "Failed to mark rent as paid" });
  }
});

export default router;
