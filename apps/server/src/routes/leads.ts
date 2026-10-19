/**
 * GET /api/leads/metrics
 * Owner-only endpoint: returns today's Leads funnel metrics for all PGs owned by the caller.
 *
 * Timezone: Asia/Kolkata (IST, UTC+5:30) — the app's target market.
 * "Today" means IST calendar date; boundaries are computed server-side in UTC.
 *
 * Metrics (per PG, distinct-visitor counts):
 *   views           – visitors who opened the PG gallery
 *   interestedLeads – gallery openers who also saved OR shared that PG
 *   qualifiedLeads  – gallery openers who clicked BOTH Enquire AND Directions for that PG
 *
 * Privacy: visitor_id values are NEVER returned. Only aggregate counts.
 */

import { Router, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { createDb, pgs } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ── IST day boundary helper ───────────────────────────────────────────────────
// IST = UTC+5:30.  We compute boundaries in JavaScript and pass them as UTC
// timestamps so the query stays portable and fully parameterised.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes

interface DayWindow {
  startUtc: Date;   // IST midnight → UTC
  endUtc: Date;     // IST midnight + 24 h → UTC
  dateIst: string;  // "YYYY-MM-DD" in IST (for the response body)
}

function getIstDayWindow(): DayWindow {
  const nowUtc = Date.now();
  const nowIstMs = nowUtc + IST_OFFSET_MS;

  // Build IST calendar date from UTC millis
  const istDate = new Date(nowIstMs);
  const y = istDate.getUTCFullYear();
  const m = istDate.getUTCMonth();
  const d = istDate.getUTCDate();

  // IST midnight for today expressed in UTC
  const istMidnightUtc = Date.UTC(y, m, d) - IST_OFFSET_MS;
  const startUtc = new Date(istMidnightUtc);
  const endUtc   = new Date(istMidnightUtc + 24 * 60 * 60 * 1000);
  const dateIst  = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return { startUtc, endUtc, dateIst };
}

// ── Metrics query ──────────────────────────────────────────────────────────────
// One CTE query covers all of the owner's PGs in a single round-trip.
// visitor_id columns are used only for COUNT(DISTINCT …) and never returned.

interface PgMetricsRow {
  pg_id: string;
  views: string | number;
  interested_leads: string | number;
  qualified_leads:  string | number;
}

async function fetchMetricsForPgs(
  pgIds: string[],
  window: DayWindow,
  db: ReturnType<typeof createDb>
): Promise<PgMetricsRow[]> {
  if (pgIds.length === 0) return [];

  // Build a type-safe UUID array literal for ANY(...)
  // Each id is interpolated as a parameter; drizzle/neon will bind them safely.
  const pgIdList = pgIds.map((id) => sql`${id}::uuid`);
  const pgIdArray = sql.join(pgIdList, sql`, `);

  const result = await db.execute(sql`
    WITH filtered AS (
      -- Restrict to owner's PGs and today's IST window in a single scan
      SELECT pg_id, visitor_id, event_type
      FROM   pg_events
      WHERE  pg_id = ANY(ARRAY[${pgIdArray}])
        AND  created_at >= ${window.startUtc}
        AND  created_at <  ${window.endUtc}
    ),
    gallery AS (
      SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_gallery_open'
    ),
    interest AS (
      SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type IN ('pg_saved', 'pg_shared')
    ),
    enquire AS (
      SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_enquire_clicked'
    ),
    directions AS (
      SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_directions_clicked'
    )
    SELECT
      g.pg_id,
      COUNT(DISTINCT g.visitor_id)                                                   AS views,
      COUNT(DISTINCT i.visitor_id)                                                   AS interested_leads,
      COUNT(DISTINCT CASE WHEN e.visitor_id IS NOT NULL
                          AND d.visitor_id IS NOT NULL
                     THEN g.visitor_id END)                                          AS qualified_leads
    FROM      gallery    g
    LEFT JOIN interest   i ON g.pg_id = i.pg_id AND g.visitor_id = i.visitor_id
    LEFT JOIN enquire    e ON g.pg_id = e.pg_id AND g.visitor_id = e.visitor_id
    LEFT JOIN directions d ON g.pg_id = d.pg_id AND g.visitor_id = d.visitor_id
    GROUP BY  g.pg_id
  `);

  return result.rows as unknown as PgMetricsRow[];
}

// ── Route ─────────────────────────────────────────────────────────────────────

// GET /api/leads/metrics
// Requires: Authorization: Bearer <jwt>
router.get("/metrics", requireAuth, async (req: Request, res: Response) => {
  try {
    const ownerId = req.owner!.ownerId;
    const db      = createDb(process.env.DATABASE_URL!);
    const window  = getIstDayWindow();

    // 1. Fetch all PGs owned by this owner (ownership check built into the query)
    const ownerPgs = await db
      .select({ id: pgs.id, name: pgs.name })
      .from(pgs)
      .where(eq(pgs.ownerId, ownerId));

    if (ownerPgs.length === 0) {
      res.json({
        date:     window.dateIst,
        timezone: "Asia/Kolkata",
        pgs:      [],
      });
      return;
    }

    const pgIds = ownerPgs.map((p) => p.id);

    // 2. Fetch metrics for all owner PGs in one query
    const metricsRows = await fetchMetricsForPgs(pgIds, window, db);

    // Index metrics by pgId for O(1) lookup
    const metricsMap = new Map<string, PgMetricsRow>(
      metricsRows.map((row) => [row.pg_id, row])
    );

    // 3. Build response — every PG appears even if it has zero events today
    const pgMetrics = ownerPgs.map((pg) => {
      const m = metricsMap.get(pg.id);
      return {
        pgId:            pg.id,
        pgName:          pg.name,
        views:           m ? Number(m.views)            : 0,
        interestedLeads: m ? Number(m.interested_leads) : 0,
        qualifiedLeads:  m ? Number(m.qualified_leads)  : 0,
      };
    });

    res.json({
      date:     window.dateIst,
      timezone: "Asia/Kolkata",
      pgs:      pgMetrics,
    });
  } catch (err) {
    console.error("Leads metrics error:", err);
    res.status(500).json({ error: "Failed to compute Leads metrics" });
  }
});

export default router;
