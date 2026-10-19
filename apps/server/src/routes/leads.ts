/**
 * GET /api/leads/metrics
 * Owner-only endpoint: returns today''s AND monthly Leads funnel metrics
 * for all PGs owned by the caller.
 *
 * Timezone: Asia/Kolkata (IST, UTC+5:30) — the app''s target market.
 * Day/month boundaries are computed server-side in UTC.
 *
 * Query params (optional):
 *   year  – 4-digit year  (must be current IST year; defaults to current year)
 *   month – 1-12          (defaults to current IST month)
 *
 * Metrics (per PG, distinct-visitor counts):
 *   views           – visitors who opened the PG gallery
 *   interestedLeads – gallery openers who also saved OR shared that PG
 *   qualifiedLeads  – gallery openers who clicked BOTH Enquire AND Directions
 *
 * Privacy: visitor_id values are NEVER returned. Only aggregate counts.
 */

import { Router, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { createDb, pgs } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// -- IST helpers ---------------------------------------------------------------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes

interface TimeWindow {
  startUtc: Date;
  endUtc:   Date;
  dateIst:  string;
}

/** Returns the IST calendar-day window for "today". */
function getIstDayWindow(): TimeWindow {
  const nowUtc   = Date.now();
  const nowIstMs = nowUtc + IST_OFFSET_MS;
  const istDate  = new Date(nowIstMs);
  const y = istDate.getUTCFullYear();
  const m = istDate.getUTCMonth();
  const d = istDate.getUTCDate();

  const istMidnightUtc = Date.UTC(y, m, d) - IST_OFFSET_MS;
  return {
    startUtc: new Date(istMidnightUtc),
    endUtc:   new Date(istMidnightUtc + 24 * 60 * 60 * 1000),
    dateIst:  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}

/** Returns the IST calendar-month window for the given year + month (1-indexed).
 *  Counts distinct visitors across the whole month — NOT a sum of daily counts. */
function getIstMonthWindow(year: number, month: number): TimeWindow {
  const startUtc = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
  const endUtc   = new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS);
  return {
    startUtc,
    endUtc,
    dateIst: `${year}-${String(month).padStart(2, "0")}`,
  };
}

/** Returns current IST year and month (1-indexed). */
function currentIstYearMonth(): { year: number; month: number } {
  const nowIstMs = Date.now() + IST_OFFSET_MS;
  const d = new Date(nowIstMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// -- Metrics query --------------------------------------------------------------

interface PgMetricsRow {
  pg_id:            string;
  views:            string | number;
  interested_leads: string | number;
  qualified_leads:  string | number;
}

async function fetchMetricsForPgs(
  pgIds:  string[],
  window: TimeWindow,
  db:     ReturnType<typeof createDb>
): Promise<PgMetricsRow[]> {
  if (pgIds.length === 0) return [];

  const pgIdList  = pgIds.map((id) => sql`${id}::uuid`);
  const pgIdArray = sql.join(pgIdList, sql`, `);

  const result = await db.execute(sql`
    WITH filtered AS (
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

function buildPgMetrics(
  ownerPgs:    { id: string; name: string }[],
  metricsRows: PgMetricsRow[]
) {
  const map = new Map<string, PgMetricsRow>(metricsRows.map((r) => [r.pg_id, r]));
  return ownerPgs.map((pg) => {
    const m = map.get(pg.id);
    return {
      pgId:            pg.id,
      pgName:          pg.name,
      views:           m ? Number(m.views)            : 0,
      interestedLeads: m ? Number(m.interested_leads) : 0,
      qualifiedLeads:  m ? Number(m.qualified_leads)  : 0,
    };
  });
}

// -- Route ---------------------------------------------------------------------

// GET /api/leads/metrics[?year=YYYY&month=M]
// Requires: Authorization: Bearer <jwt>
router.get("/metrics", requireAuth, async (req: Request, res: Response) => {
  try {
    const ownerId = req.owner!.ownerId;
    const db      = createDb(process.env.DATABASE_URL!);

    const ist = currentIstYearMonth();
    let reqYear  = ist.year;
    let reqMonth = ist.month;

    if (req.query.year !== undefined || req.query.month !== undefined) {
      const y  = parseInt(String(req.query.year  ?? ist.year),  10);
      const mo = parseInt(String(req.query.month ?? ist.month), 10);

      if (isNaN(y) || isNaN(mo) || mo < 1 || mo > 12 || y !== ist.year) {
        res.status(400).json({ error: "Invalid year or month. Only current-year months (1-12) are supported." });
        return;
      }
      if (y === ist.year && mo > ist.month) {
        res.status(400).json({ error: "Cannot request metrics for a future month." });
        return;
      }
      reqYear  = y;
      reqMonth = mo;
    }

    const todayWindow = getIstDayWindow();
    const monthWindow = getIstMonthWindow(reqYear, reqMonth);

    const ownerPgs = await db
      .select({ id: pgs.id, name: pgs.name })
      .from(pgs)
      .where(eq(pgs.ownerId, ownerId));

    if (ownerPgs.length === 0) {
      res.json({
        date:     todayWindow.dateIst,
        month:    monthWindow.dateIst,
        timezone: "Asia/Kolkata",
        today:    [],
        monthly:  [],
      });
      return;
    }

    const pgIds = ownerPgs.map((p) => p.id);

    const [todayRows, monthRows] = await Promise.all([
      fetchMetricsForPgs(pgIds, todayWindow, db),
      fetchMetricsForPgs(pgIds, monthWindow, db),
    ]);

    res.json({
      date:     todayWindow.dateIst,
      month:    monthWindow.dateIst,
      timezone: "Asia/Kolkata",
      today:    buildPgMetrics(ownerPgs, todayRows),
      monthly:  buildPgMetrics(ownerPgs, monthRows),
    });
  } catch (err) {
    console.error("Leads metrics error:", err);
    res.status(500).json({ error: "Failed to compute Leads metrics" });
  }
});

export default router;