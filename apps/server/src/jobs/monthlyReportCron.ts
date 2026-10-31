import cron from "node-cron";
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

  // Check 1: 1st of every month (Sends Previous Month's Completed Dossier)
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

  // Check 2: 15th of every month (Mid-Month Audit)
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

export function initMonthlyReportCron(): void {
  // Run every morning at 09:00 AM (0 9 * * *)
  cron.schedule("0 9 * * *", async () => {
    const check = isScheduledReportDay();
    if (!check.shouldRun) {
      return;
    }
    console.log(`🔔 Scheduled trigger activated: ${check.reason} (Month: ${check.reportMonth})`);
    await runMonthlyBackupForAllPgs(check.reportMonth, check.reason);
  });

  console.log(
    "⏱️  Monthly PG Tenant Report Cron Initialized (Active on 1st & 15th of every month at 09:00 AM for Active PGs)"
  );
}
