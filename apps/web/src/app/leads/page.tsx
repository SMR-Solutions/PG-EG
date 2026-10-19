"use client";

/**
 * /leads — Leads Metrics Dashboard for PG Owners
 *
 * Shows today's (IST) funnel metrics from GET /api/leads/metrics:
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
  date: string;       // "YYYY-MM-DD" in IST
  timezone: string;   // "Asia/Kolkata"
  pgs: PgMetrics[];
}

/* ─── Metric card (summary row) ─────────────────────────────────── */
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

/* ─── Main Page ─────────────────────────────────────────────────── */
export default function LeadsPage() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading: authLoading, role } = useAuth();

  const [data, setData]       = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Auth guard — mirrors dashboard pattern exactly
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/leads");
    }
    if (!authLoading && isAuthenticated && role === "user") {
      router.replace("/find-pg");
    }
  }, [authLoading, isAuthenticated, role, router]);

  // ── Auth header helper ──
  const authHeader = useCallback(
    (): Record<string, string> =>
      token ? { Authorization: `Bearer ${token}` } : {},
    [token]
  );

  // ── Fetch leads metrics ──
  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/leads/metrics`, {
        headers: { ...authHeader() },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load metrics");
      setData(json as LeadsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Leads metrics.");
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  // Wait for auth to resolve before fetching — same guard as dashboard
  useEffect(() => {
    if (authLoading)          return;
    if (!isAuthenticated)     return;
    if (role === "user")      return;
    loadMetrics();
  }, [loadMetrics, authLoading, isAuthenticated, role]);

  // ── Aggregate totals across all PGs ──
  const totalViews           = data?.pgs.reduce((s, p) => s + p.views,           0) ?? 0;
  const totalInterested      = data?.pgs.reduce((s, p) => s + p.interestedLeads, 0) ?? 0;
  const totalQualified       = data?.pgs.reduce((s, p) => s + p.qualifiedLeads,  0) ?? 0;

  // ─── Render: loading / auth pending ───────────────────────────
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
          <button className={styles.retryBtn} onClick={loadMetrics} id="btn-retry-leads">
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

        {/* Date + timezone badge */}
        {data && (
          <div className={styles.dateBadge}>
            📅 {data.date}
            <span className={styles.tzLabel}>IST · {data.timezone}</span>
          </div>
        )}

        {/* Summary: 3 metric cards (totals across all PGs) */}
        <p className={styles.sectionTitle}>Today&apos;s Leads — All PGs</p>
        <div className={styles.metricsRow}>
          <MetricCard emoji="👁️"  value={totalViews}      label="Views"      accent="green"  />
          <MetricCard emoji="💛"  value={totalInterested} label="Interested"  accent="amber"  />
          <MetricCard emoji="🎯"  value={totalQualified}  label="Qualified"   accent="indigo" />
        </div>

        {/* Per-PG breakdown — only shown when owner has multiple PGs */}
        {data && data.pgs.length > 0 ? (
          <>
            {data.pgs.length > 1 && (
              <p className={styles.sectionTitle}>Breakdown by PG</p>
            )}
            {data.pgs.map((pg) => (
              <PgCard key={pg.pgId} pg={pg} />
            ))}
          </>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📊</span>
            <p className={styles.emptyTitle}>No activity today yet</p>
            <p className={styles.emptyDesc}>
              Leads data appears here once tenants start viewing and engaging with your PG listings.
              Share your PG link to attract more visitors!
            </p>
          </div>
        )}

        {/* Legend — metric definitions */}
        <div className={styles.legend}>
          <div className={styles.legendRow}>
            <span className={`${styles.legendDot} ${styles.green}`} />
            <span className={styles.legendText}>
              <strong>Views</strong> — distinct visitors who opened your PG gallery today.
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
