"use client";

/**
 * /leads — Leads Metrics Dashboard for PG Owners
 *
 * Shows Monthly and Today''s Leads funnel metrics from GET /api/leads/metrics:
 *   - Views           : distinct visitors who opened the PG gallery
 *   - Interested Leads: gallery openers who also saved or shared the PG
 *   - Qualified Leads : gallery openers who clicked both Enquire and Directions
 *
 * Uses the same auth pattern as /expenses and /dashboard.
 * Never exposes visitor IDs or personal details.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AppLogo from "@/components/AppLogo";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/* ─── Types ──────────────────────────────────────────────────────── */
interface PgMetrics {
  pgId: string;
  pgName: string;
  views: number;
  interestedLeads: number;
  qualifiedLeads: number;
}

interface LeadsResponse {
  date: string;      // "YYYY-MM-DD" in IST
  month: string;     // "YYYY-MM" in IST
  timezone: string;  // "Asia/Kolkata"
  today: PgMetrics[];
  monthly: PgMetrics[];
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function formatDateDDMMYYYY(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function monthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

/* ─── Metric summary card ────────────────────────────────────────── */
function MetricCard({
  emoji, value, label, accent,
}: { emoji: string; value: number; label: string; accent: "green" | "amber" | "indigo" }) {
  return (
    <div className={`${styles.metricCard} ${styles[accent]}`}>
      <span className={styles.metricEmoji}>{emoji}</span>
      <span className={styles.metricNum}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}

/* ─── Single PG breakdown card ──────────────────────────────────── */
function PgCard({ pg }: { pg: PgMetrics }) {
  const typeEmoji =
    pg.pgName.toLowerCase().includes("ladies") ? "🚺" :
    pg.pgName.toLowerCase().includes("gents")  ? "🚹" : "🏢";

  return (
    <div className={styles.pgCard}>
      <div className={styles.pgCardHeader}>
        <span className={styles.pgCardEmoji}>{typeEmoji}</span>
        <span className={styles.pgCardName}>{pg.pgName}</span>
      </div>
      <div className={styles.pgMetricsGrid}>
        <div className={`${styles.pgMetricItem} ${styles.green}`}>
          <span className={styles.pgMetricVal}>{pg.views}</span>
          <span className={styles.pgMetricLbl}>Views</span>
        </div>
        <div className={`${styles.pgMetricItem} ${styles.amber}`}>
          <span className={styles.pgMetricVal}>{pg.interestedLeads}</span>
          <span className={styles.pgMetricLbl}>Interested</span>
        </div>
        <div className={`${styles.pgMetricItem} ${styles.indigo}`}>
          <span className={styles.pgMetricVal}>{pg.qualifiedLeads}</span>
          <span className={styles.pgMetricLbl}>Qualified</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Monthly section: aggregate metric cards only, no per-PG breakdown ─── */
function MonthlySection({ pgs, emptyMsg }: { pgs: PgMetrics[]; emptyMsg: string }) {
  const totalViews      = pgs.reduce((s, p) => s + p.views,           0);
  const totalInterested = pgs.reduce((s, p) => s + p.interestedLeads, 0);
  const totalQualified  = pgs.reduce((s, p) => s + p.qualifiedLeads,  0);

  if (pgs.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>📊</span>
        <p className={styles.emptyTitle}>{emptyMsg}</p>
        <p className={styles.emptyDesc}>
          Leads data appears here once tenants start viewing and engaging with your PG listings.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.metricsRow}>
      <MetricCard emoji="👁️"  value={totalViews}      label="Views"      accent="green"  />
      <MetricCard emoji="💛"  value={totalInterested} label="Interested"  accent="amber"  />
      <MetricCard emoji="🎯"  value={totalQualified}  label="Qualified"   accent="indigo" />
    </div>
  );
}

/* ─── Today section: compact per-PG cards only, no aggregate row ─── */
function TodaySection({ pgs, emptyMsg }: { pgs: PgMetrics[]; emptyMsg: string }) {
  if (pgs.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>📊</span>
        <p className={styles.emptyTitle}>{emptyMsg}</p>
        <p className={styles.emptyDesc}>
          Leads data appears here once tenants start viewing and engaging with your PG listings.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.pgCardsGrid}>
      {pgs.map((pg) => (
        <PgCard key={pg.pgId} pg={pg} />
      ))}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────── */
export default function LeadsPage() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading: authLoading, role } = useAuth();

  // Compute current IST month on client (matches server''s currentIstYearMonth)
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const currentYear  = nowIst.getUTCFullYear();
  const currentMonth = nowIst.getUTCMonth() + 1; // 1-indexed

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [data, setData]   = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/leads");
    }
    if (!authLoading && isAuthenticated && role === "user") {
      router.replace("/find-pg");
    }
  }, [authLoading, isAuthenticated, role, router]);

  const authHeader = useCallback(
    (): Record<string, string> =>
      token ? { Authorization: `Bearer ${token}` } : {},
    [token]
  );

  const loadMetrics = useCallback(async (month: number) => {
    setLoading(true);
    setError("");
    try {
      const url = `${API_URL}/api/leads/metrics?year=${currentYear}&month=${month}`;
      const res = await fetch(url, { headers: { ...authHeader() } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load metrics");
      setData(json as LeadsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Leads metrics.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, currentYear]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || role === "user") return;
    loadMetrics(selectedMonth);
  }, [loadMetrics, authLoading, isAuthenticated, role, selectedMonth]);

  // ─── Month dropdown options — current year months up to now ───
  const monthOptions = Array.from({ length: currentMonth }, (_, i) => i + 1);

  // ─── Render: loading ───────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <main className={styles.main}>
        <div className={styles.centered}>
          <span className={styles.spinner} />
        </div>
      </main>
    );
  }

  // ─── Render: error ─────────────────────────────────────────────
  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.centered}>
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryBtn} onClick={() => loadMetrics(selectedMonth)} id="btn-retry-leads">
            Try Again
          </button>
        </div>
      </main>
    );
  }

  // ─── Render: success ───────────────────────────────────────────
  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>

        {/* Logo Bar + back button */}
        <div className={styles.logoBar}>
          <button
            className={styles.backBtn}
            onClick={() => router.push("/dashboard")}
            id="btn-back-to-dashboard"
            aria-label="Back to dashboard"
          >
            ←
          </button>
          <AppLogo size="sm" />
        </div>

        {/* Date badge — DD/MM/YYYY, no timezone label */}
        {data && (
          <div className={styles.dateBadge}>
            📅 {formatDateDDMMYYYY(data.date)}
          </div>
        )}

        {/* ── Monthly Leads ── */}
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Monthly Leads</p>
          <select
            id="select-month"
            className={styles.monthSelect}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            aria-label="Select month"
          >
            {monthOptions.map((mo) => (
              <option key={mo} value={mo}>
                {MONTH_NAMES[mo - 1]}
              </option>
            ))}
          </select>
        </div>
        {data && (
          <p className={styles.periodLabel}>
            {monthLabel(data.month)}
          </p>
        )}
        <MonthlySection
          pgs={data?.monthly ?? []}
          emptyMsg="No activity this month yet"
        />

        {/* ── Today's Leads ── */}
        <div className={styles.sectionDivider} />
        <p className={styles.sectionTitle}>
          Today&apos;s Leads
          {data && (
            <span className={styles.todayDate}> — {formatDateDDMMYYYY(data.date)}</span>
          )}
        </p>
        <TodaySection
          pgs={data?.today ?? []}
          emptyMsg="No activity today yet"
        />

        {/* Legend */}
        <div className={styles.legend}>
          <div className={styles.legendRow}>
            <span className={`${styles.legendDot} ${styles.green}`} />
            <span className={styles.legendText}>
              <strong>Views</strong> — distinct visitors who opened your PG gallery.
            </span>
          </div>
          <div className={styles.legendRow}>
            <span className={`${styles.legendDot} ${styles.amber}`} />
            <span className={styles.legendText}>
              <strong>Interested</strong> — gallery visitors who also saved or shared your PG.
            </span>
          </div>
          <div className={styles.legendRow}>
            <span className={`${styles.legendDot} ${styles.indigo}`} />
            <span className={styles.legendText}>
              <strong>Qualified</strong> — gallery visitors who clicked both Enquire and Directions for your PG.
            </span>
          </div>
        </div>

      </div>
    </main>
  );
}