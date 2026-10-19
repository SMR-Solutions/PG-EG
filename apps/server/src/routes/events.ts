import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { createDb, pgs, pgEvents } from "../db";

const router = Router();

/** Allowlist — expand in future chunks as new event types are added */
const ALLOWED_EVENT_TYPES = new Set([
  // Chunk 2 — discovery
  "pg_card_impression",
  "pg_gallery_open",
  // Chunk 3 — interest actions
  "pg_saved",
  "pg_shared",
  "pg_enquire_clicked",
  "pg_directions_clicked",
]);

/** UUID v4 shape (loose check — prevents injection without a full uuid library) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/events
// Public — no auth required.  Fire-and-forget from the client.
router.post("/", async (req: Request, res: Response) => {
  try {
    const { pgId, eventType, visitorId } =
      req.body as { pgId?: unknown; eventType?: unknown; visitorId?: unknown };

    // ── Validate pgId ─────────────────────────────────────────────────────
    if (typeof pgId !== "string" || !UUID_RE.test(pgId)) {
      res.status(400).json({ error: "Invalid pgId" });
      return;
    }

    // ── Validate eventType ────────────────────────────────────────────────
    if (typeof eventType !== "string" || !ALLOWED_EVENT_TYPES.has(eventType)) {
      res.status(400).json({ error: "Invalid eventType" });
      return;
    }

    // ── Validate visitorId (non-empty, not too long, no PII shape enforced) ─
    if (
      typeof visitorId !== "string" ||
      visitorId.trim().length < 4 ||
      visitorId.length > 128
    ) {
      res.status(400).json({ error: "Invalid visitorId" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);

    // ── Confirm the PG actually exists ────────────────────────────────────
    const [pg] = await db
      .select({ id: pgs.id })
      .from(pgs)
      .where(eq(pgs.id, pgId))
      .limit(1);

    if (!pg) {
      res.status(404).json({ error: "PG not found" });
      return;
    }

    // ── Persist the event ─────────────────────────────────────────────────
    await db.insert(pgEvents).values({
      pgId,
      eventType,
      visitorId: visitorId.trim(),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Event tracking error:", err);
    res.status(500).json({ error: "Failed to record event" });
  }
});

export default router;
