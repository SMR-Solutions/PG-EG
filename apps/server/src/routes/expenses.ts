import { Router, Request, Response } from "express";
import { createDb, expenses, pgs } from "../db";
import { requireAuth } from "../middleware/auth";
import { eq, and, gte, lte, desc } from "drizzle-orm";

const router = Router();

// Helper: verify ownership
async function verifyOwner(pgId: string, ownerId: string, res: Response) {
  const db = createDb(process.env.DATABASE_URL!);
  const [pg] = await db.select({ id: pgs.id }).from(pgs)
    .where(and(eq(pgs.id, pgId), eq(pgs.ownerId, ownerId)));
  if (!pg) { res.status(403).json({ error: "Forbidden" }); return null; }
  return pg;
}

// ─── GET /api/expenses/:pgId?year=2026 ────────────────────────────────────
router.get("/:pgId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId } = req.params;
    const pg = await verifyOwner(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const from = `${year}-01-01`;
    const to   = `${year}-12-31`;

    const db = createDb(process.env.DATABASE_URL!);
    const rows = await db.select().from(expenses)
      .where(and(
        eq(expenses.pgId, pgId),
        gte(expenses.date, from),
        lte(expenses.date, to)
      ))
      .orderBy(desc(expenses.date));

    res.json({ expenses: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed" }); }
});

// ─── POST /api/expenses/:pgId ──────────────────────────────────────────────
router.post("/:pgId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId } = req.params;
    const pg = await verifyOwner(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const { item, amount, date } = req.body as { item: string; amount: number; date?: string };
    if (!item?.trim() || !amount || amount <= 0) {
      res.status(400).json({ error: "item and amount (>0) are required" }); return;
    }
    const expDate = date || new Date().toISOString().slice(0, 10);
    const db = createDb(process.env.DATABASE_URL!);
    const [row] = await db.insert(expenses).values({
      pgId, item: item.trim(), amount: String(amount), date: expDate,
    }).returning();
    res.status(201).json({ expense: row });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed" }); }
});

// ─── DELETE /api/expenses/:pgId/:expId ────────────────────────────────────
router.delete("/:pgId/:expId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pgId, expId } = req.params;
    const pg = await verifyOwner(pgId, req.owner!.ownerId, res);
    if (!pg) return;

    const db = createDb(process.env.DATABASE_URL!);
    await db.delete(expenses).where(and(eq(expenses.id, expId), eq(expenses.pgId, pgId)));
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed" }); }
});

export default router;
