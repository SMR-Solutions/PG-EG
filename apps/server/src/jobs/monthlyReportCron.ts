import cron from "node-cron";
import { neon } from "@neondatabase/serverless";
import { createDb, pgs, owners } from "../db";
import { eq } from "drizzle-orm";
import { sendPgMonthlyReportEmail, getCurrentMonthStr } from "../services/reportDataService";

export function isScheduledReportDay(now: Date = new Date()): {
  shouldRun: boolean;
  reason: string;
  reportMonth?: string;
} {
  const day = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed (0=Jan, 1=Feb, ..., 10=Nov, 11=Dec)

  // Check 1: 1st of every month (Sends Previous Month's Completed Closing Dossier)
  // Clean & reliable without calendar length variations (28/29/30/31 days)
  if (day === 1) {
    const prevDate = new Date(year, month - 1, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    return {
      shouldRun: true,
      reason: "1st of Month Previous Month Closing Dossier",
      reportMonth: prevMonthStr,
    };
  }

  // Check 2: 15th of every month (Mid-Month Safety Audit)
  if (day === 15) {
    const curMonthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    return {
      shouldRun: true,
      reason: "Mid-Month 15th Safety Audit",
      reportMonth: curMonthStr,
    };
  }

  return { shouldRun: false, reason: "Not a scheduled report day" };
}

async function ensureAuditTable(sql: any): Promise<void> {
  await sql(
    `CREATE TABLE IF NOT EXISTS cron_report_dispatches (
      report_key TEXT PRIMARY KEY,
      dispatched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      success_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      details TEXT
    );`
  );
}

export async function hasReportDispatchedToday(reportKey: string): Promise<boolean> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureAuditTable(sql);
    const rows = await sql(
      `SELECT report_key FROM cron_report_dispatches WHERE report_key = $1 LIMIT 1;`,
      [reportKey]
    );
    return rows.length > 0;
  } catch (err) {
    console.warn("[Cron DB Check] Warning checking dispatch audit table:", err);
    return false;
  }
}

export async function recordReportDispatch(
  reportKey: string,
  successCount: number,
  errorCount: number,
  details: string
): Promise<void> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureAuditTable(sql);
    await sql(
      `INSERT INTO cron_report_dispatches (report_key, success_count, error_count, details)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (report_key) DO UPDATE
       SET dispatched_at = NOW(),
           success_count = EXCLUDED.success_count,
           error_count = EXCLUDED.error_count,
           details = EXCLUDED.details;`,
      [reportKey, successCount, errorCount, details]
    );
  } catch (err) {
    console.warn("[Cron DB Record] Warning recording dispatch audit:", err);
  }
}

export async function runMonthlyBackupForAllPgs(
  customMonth?: string,
  triggerReason?: string
): Promise<{
  totalPgs: number;
  sentCount: number;
  errors: Array<{ pgId: string; pgName: string; error: string }>;
}> {
  console.log(`\n============================================================`);
  console.log(`🕒 [MONTHLY BACKUP CRON] Triggered: ${triggerReason || "Automated Schedule"}`);
  console.log(`============================================================`);

  const db = createDb(process.env.DATABASE_URL!);
  // Only dispatch automated safety reports for ACTIVE PGs
  const activePgs = await db.select().from(pgs).where(eq(pgs.isActive, true));
  const targetMonth = customMonth || getCurrentMonthStr();

  let sentCount = 0;
  const errors: Array<{ pgId: string; pgName: string; error: string }> = [];

  for (const pg of activePgs) {
    try {
      // Find owner email
      const [owner] = await db.select().from(owners).where(eq(owners.id, pg.ownerId)).limit(1);
      if (!owner || !owner.email) {
        console.log(`⏩ Skipping Active PG "${pg.name}" (${pg.id}): No owner email registered.`);
        continue;
      }

      console.log(`📤 Sending monthly safety report for Active PG "${pg.name}" to ${owner.email}...`);
      await sendPgMonthlyReportEmail(pg.id, targetMonth);
      sentCount++;
    } catch (err: any) {
      console.error(`❌ Failed to send monthly report for PG "${pg.name}":`, err?.message || err);
      errors.push({ pgId: pg.id, pgName: pg.name, error: err?.message || String(err) });
    }
  }

  console.log(
    `✅ [MONTHLY BACKUP CRON] Finished. Successfully dispatched ${sentCount}/${activePgs.length} reports to Active PGs.`
  );
  return { totalPgs: activePgs.length, sentCount, errors };
}

export async function triggerScheduledReportCatchUp(isForce: boolean = false): Promise<{
  executed: boolean;
  reason: string;
  result?: { totalPgs: number; sentCount: number; errors: any[] };
}> {
  const check = isScheduledReportDay();
  if (!check.shouldRun && !isForce) {
    return { executed: false, reason: check.reason };
  }

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  if (!isForce) {
    const alreadySent = await hasReportDispatchedToday(todayKey);
    if (alreadySent) {
      console.log(`[Cron Catch-up] Report for ${todayKey} already completed earlier today. Skipping duplicate.`);
      return { executed: false, reason: `Already dispatched today (${todayKey})` };
    }
  }

  console.log(`[Cron Catch-up] Triggering safety reports for ${todayKey} (${check.reason})...`);
  const result = await runMonthlyBackupForAllPgs(check.reportMonth, check.reason);
  await recordReportDispatch(
    todayKey,
    result.sentCount,
    result.errors.length,
    JSON.stringify({ reason: check.reason, reportMonth: check.reportMonth, errors: result.errors })
  );

  return { executed: true, reason: check.reason, result };
}

export function initMonthlyReportCron(): void {
  // 1. Regular 09:00 AM Cron Schedule
  cron.schedule("0 9 * * *", async () => {
    try {
      console.log("⏰ 09:00 AM Cron Tick: Checking report dispatch...");
      await triggerScheduledReportCatchUp(false);
    } catch (err) {
      console.error("[Cron Scheduler Error]", err);
    }
  });

  // 2. Render Wake-up Catch-up (Runs 15s after server boot/wake)
  // Ensures that if Render was hibernating at 09:00 AM, it catches up immediately upon waking!
  setTimeout(async () => {
    try {
      console.log("[Cron Wake Check] Checking if today's scheduled report needs catch-up...");
      await triggerScheduledReportCatchUp(false);
    } catch (err) {
      console.error("[Cron Wake Check Error]", err);
    }
  }, 15000);

  console.log(
    "⏱️  Monthly PG Tenant Report Cron Initialized (Active on 1st & 15th at 09:00 AM + Auto Wake-up Catch-up for Active PGs)"
  );
}
