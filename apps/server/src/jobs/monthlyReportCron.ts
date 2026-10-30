import cron from "node-cron";
import { createDb, pgs, owners } from "../db";
import { eq } from "drizzle-orm";
import { sendPgMonthlyReportEmail, getCurrentMonthStr } from "../services/reportDataService";

export function isScheduledReportDay(now: Date = new Date()): { shouldRun: boolean; reason: string } {
  const day = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // Check 1: 15th of month (Mid-Month Audit)
  if (day === 15) {
    return { shouldRun: true, reason: "Mid-Month 15th Safety Audit" };
  }

  // Check 2: Last day of the current month (28, 29, 30, or 31)
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  if (day === lastDayOfMonth) {
    return { shouldRun: true, reason: "Month-End Final Closing Dossier" };
  }

  return { shouldRun: false, reason: "Not a scheduled report day" };
}

export async function runMonthlyBackupForAllPgs(customMonth?: string, triggerReason?: string): Promise<{
  totalPgs: number;
  sentCount: number;
  errors: Array<{ pgId: string; pgName: string; error: string }>;
}> {
  console.log(`\n============================================================`);
  console.log(`🕒 [MONTHLY BACKUP CRON] Triggered: ${triggerReason || "Automated Schedule"}`);
  console.log(`============================================================`);

  const db = createDb(process.env.DATABASE_URL!);
  const allPgs = await db.select().from(pgs);
  const targetMonth = customMonth || getCurrentMonthStr();

  let sentCount = 0;
  const errors: Array<{ pgId: string; pgName: string; error: string }> = [];

  for (const pg of allPgs) {
    try {
      // Find owner email
      const [owner] = await db.select().from(owners).where(eq(owners.id, pg.ownerId)).limit(1);
      if (!owner || !owner.email) {
        console.log(`⏩ Skipping PG "${pg.name}" (${pg.id}): No owner email registered.`);
        continue;
      }

      console.log(`📤 Sending monthly safety report for "${pg.name}" to ${owner.email}...`);
      await sendPgMonthlyReportEmail(pg.id, targetMonth);
      sentCount++;
    } catch (err: any) {
      console.error(`❌ Failed to send monthly report for PG "${pg.name}":`, err?.message || err);
      errors.push({ pgId: pg.id, pgName: pg.name, error: err?.message || String(err) });
    }
  }

  console.log(`✅ [MONTHLY BACKUP CRON] Finished. Successfully dispatched ${sentCount}/${allPgs.length} reports.`);
  return { totalPgs: allPgs.length, sentCount, errors };
}

export function initMonthlyReportCron(): void {
  // Run every morning at 09:00 AM (0 9 * * *)
  cron.schedule("0 9 * * *", async () => {
    const check = isScheduledReportDay();
    if (!check.shouldRun) {
      return;
    }
    console.log(`🔔 Scheduled trigger activated: ${check.reason}`);
    await runMonthlyBackupForAllPgs(undefined, check.reason);
  });

  console.log("⏱️  Monthly PG Tenant Report Cron Initialized (Active on 15th & Last day of month at 09:00 AM)");
}
