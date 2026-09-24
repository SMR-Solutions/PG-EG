"use client";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────
interface Payment {
  id: string;
  tenantId: string;
  bedId: string;
  month: string;
  amount: number;
  paidAmount: number;
  status: "pending" | "partial" | "paid";
  paymentMode: string | null;
  tenantName: string | null;
  tenantPhone: string | null;
  tenantPhoto: string | null;
  roomNumber: string | null;
  floor: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(n % 100000 === 0 ? 0 : 1) + "L";
  if (n >= 1000)   return "₹" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "K";
  return "₹" + n.toLocaleString("en-IN");
}

function getMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const curMonth = now.getMonth(); // 0-indexed
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const opts = [];
  for (let m = 0; m <= curMonth; m++) {
    const val = `${year}-${String(m + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: `${MONTHS[m]} ${year}` });
  }
  return opts.reverse(); // newest first
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(val: string) {
  const [y, m] = val.split("-");
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

// ─── SVG Donut Chart ──────────────────────────────────────────────────
function DonutChart({ collected, pending, total }: { collected: number; pending: number; total: number }) {
  const r = 70; const cx = 90; const cy = 90; const stroke = 18;
  const circ = 2 * Math.PI * r;

  const collectedPct = total > 0 ? collected / total : 0;
  const pendingPct   = total > 0 ? pending   / total : 0;
  const emptyPct     = 1 - collectedPct - pendingPct;

  // offsets: start from top (-π/2)
  const gap = circ * 0.012; // tiny gap between segments
  const collectedLen = circ * collectedPct - (collectedPct > 0 ? gap : 0);
  const pendingLen   = circ * pendingPct   - (pendingPct   > 0 ? gap : 0);
  const emptyLen     = circ * emptyPct     - (emptyPct     > 0 ? gap : 0);

  const collectedOffset = 0;
  const pendingOffset   = -(collectedLen + gap);
  const emptyOffset     = -(collectedLen + gap + pendingLen + gap);

  return (
    <div className={styles.donutWrap}>
      <svg width={180} height={180} className={styles.donutSvg}>
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-overlay)" strokeWidth={stroke} />
        {/* empty/no-rent segment */}
        {emptyPct > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth={stroke}
            strokeDasharray={`${emptyLen} ${circ}`}
            strokeDashoffset={emptyOffset}
            strokeLinecap="round"
            style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px`, transition: "stroke-dasharray 0.6s" }}
          />
        )}
        {/* pending segment */}
        {pendingPct > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e63946" strokeWidth={stroke}
            strokeDasharray={`${pendingLen} ${circ}`}
            strokeDashoffset={pendingOffset}
            strokeLinecap="round"
            style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px`, transition: "stroke-dasharray 0.6s" }}
          />
        )}
        {/* collected segment */}
        {collectedPct > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2dc653" strokeWidth={stroke}
            strokeDasharray={`${collectedLen} ${circ}`}
            strokeDashoffset={collectedOffset}
            strokeLinecap="round"
            style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px`, transition: "stroke-dasharray 0.6s" }}
          />
        )}
        {/* center text */}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-primary)"
          fontSize="18" fontWeight="900" fontFamily="inherit">
          {fmt(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-muted)"
          fontSize="10" fontWeight="700" fontFamily="inherit" letterSpacing="1">
          TOTAL
        </text>
      </svg>
      <div className={styles.donutLegend}>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ background: "#2dc653" }} />
          <span className={styles.legendLabel}>Collected</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ background: "#e63946" }} />
          <span className={styles.legendLabel}>Pending</span>
        </div>
        {emptyPct > 0 && (
          <div className={styles.legendItem}>
            <div className={styles.legendDot} style={{ background: "#374151" }} />
            <span className={styles.legendLabel}>No record</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tenant row in floor modal ────────────────────────────────────────
function TenantRow({ p, onNavigate }: { p: Payment; onNavigate: (id: string) => void }) {
  const due = p.amount - p.paidAmount;
  const dotColor = p.status === "paid" ? "#2dc653" : p.status === "partial" ? "#f4a261" : "#e63946";
  return (
    <div className={styles.tenantCard} onClick={() => onNavigate(p.tenantId)}>
      <div className={styles.tenantDot} style={{ background: dotColor }} />
      {p.tenantPhoto
        ? <img src={p.tenantPhoto} alt={p.tenantName ?? ""} className={styles.tenantAvatar} />
        : <div className={styles.tenantInitial}>{(p.tenantName ?? "?")[0].toUpperCase()}</div>
      }
      <div className={styles.tenantInfo}>
        <div className={styles.tenantName}>{p.tenantName ?? "Unknown"}</div>
        <div className={styles.tenantRoom}>Room {p.roomNumber ?? "—"}</div>
        <div className={styles.tenantRentRow}>
          <span className={styles.tenantRentAmt}>Rent {fmt(p.amount)}</span>
          <span className={styles.tenantRentAmt}>· Paid {fmt(p.paidAmount)}</span>
          {p.status === "paid" && (
            <span className={`${styles.statusChip} ${styles.chipPaid}`}>PAID ✓</span>
          )}
          {p.status === "partial" && (
            <span className={`${styles.statusChip} ${styles.chipPartial}`}>{fmt(due)} DUE</span>
          )}
          {p.status === "pending" && (
            <span className={`${styles.statusChip} ${styles.chipDue}`}>{fmt(p.amount)} DUE</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function RentsPage() {
  const router = useRouter();
  const { activePgId, token } = useAuth();
  const pgId = activePgId
    || (typeof window !== "undefined"
        ? (localStorage.getItem("pg_eg_active_pg_id") || localStorage.getItem("pg_eg_pg_id"))
        : null);

  const authHeader = useCallback(
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const [month, setMonth] = useState(currentMonthValue());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const fetchPayments = useCallback(async (m: string): Promise<Payment[]> => {
    if (!pgId || !token) return [];
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/rent?pgId=${pgId}&month=${m}`, {
        headers: authHeader(),
      });
      const d = await res.json();
      const list: Payment[] = d.payments ?? [];
      setPayments(list);
      return list;
    } catch { return []; }
    finally { setLoading(false); }
  }, [pgId, token, authHeader]);

  // Load + auto-generate for current month if no records exist
  useEffect(() => {
    if (!pgId || !token) return;
    (async () => {
      const list = await fetchPayments(month);
      if (list.length === 0 && month === currentMonthValue()) {
        setGenerating(true);
        try {
          await fetch(`${API_URL}/api/rent/generate?pgId=${pgId}`, {
            method: "POST", headers: authHeader(),
          });
          await fetchPayments(month);
        } finally { setGenerating(false); }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgId, token, month]);

  // Compute summary
  const totalRent = payments.reduce((s, p) => s + p.amount, 0);
  const collected = payments.reduce((s, p) => s + p.paidAmount, 0);
  const pending   = totalRent - collected;
  const paidCount = payments.filter(p => p.status === "paid").length;

  // Group by floor
  const floors = useMemo(() => {
    const map = new Map<number, Payment[]>();
    payments.forEach(p => {
      const f = p.floor ?? 0;
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [payments]);

  const floorModalPayments = selectedFloor !== null
    ? (floors.find(([f]) => f === selectedFloor)?.[1] ?? [])
    : [];

  async function handleGenerate() {
    if (!pgId) return;
    setGenerating(true);
    try {
      await fetch(`${API_URL}/api/rent/generate?pgId=${pgId}`, {
        method: "POST", headers: authHeader(),
      });
      await fetchPayments(month);
    } finally { setGenerating(false); }
  }

  const [printing, setPrinting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showExport) return;
    function onClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showExport]);

  // ─── Build the report HTML (shared between download & share) ───────
  async function buildReportHTML(): Promise<string> {
    const details = await Promise.all(
      payments.map(p =>
        fetch(`${API_URL}/api/tenants/${p.tenantId}`, { headers: authHeader() })
          .then(r => r.json())
          .catch(() => null)
      )
    );

    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [yr, mo] = month.split("-");
    const monthStr = `${MONTHS[parseInt(mo)-1]} ${yr}`;
    const fmtRs  = (n: number) => `₹${n.toLocaleString("en-IN")}`;
    const fmtDate = (d: string | null | undefined) => {
      if (!d) return "—";
      return new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
    };

    const rows = payments.map((p, i) => ({ p, d: details[i] })).sort((a, b) => {
      const fa = a.p.floor ?? 0, fb = b.p.floor ?? 0;
      if (fa !== fb) return fa - fb;
      return (a.p.roomNumber ?? "").localeCompare(b.p.roomNumber ?? "");
    });

    const floorMap = new Map<number, typeof rows>();
    rows.forEach(r => {
      const f = r.p.floor ?? 0;
      if (!floorMap.has(f)) floorMap.set(f, []);
      floorMap.get(f)!.push(r);
    });
    const floorGroups = Array.from(floorMap.entries()).sort((a, b) => a[0] - b[0]);

    const renderTenant = (p: Payment, d: {tenant: Record<string,unknown>; bed: Record<string,unknown>; room: Record<string,unknown>} | null) => {
      const t   = d?.tenant  as Record<string, unknown> | undefined;
      const bed = d?.bed     as Record<string, unknown> | undefined;
      const room= d?.room    as Record<string, unknown> | undefined;
      const initials  = String(t?.name ?? p.tenantName ?? "?")[0].toUpperCase();
      const due       = p.amount - p.paidAmount;
      const badgeCls  = p.status === "paid" ? "badge-paid" : p.status === "partial" ? "badge-partial" : "badge-pending";
      const badgeTxt  = p.status === "paid" ? "PAID ✓" : p.status === "partial"
        ? `${fmtRs(due)} DUE` : `${fmtRs(p.amount)} DUE`;
      const advAmt    = Number(t?.advanceAmount ?? 0);
      const dedAmt    = Number(t?.depositDeduction ?? 0);
      const joinDate  = fmtDate(t?.joiningDate as string);

      // Status dot beside tenant name
      const isActive   = !t?.leavingDate && (t?.status ?? "active") !== "checked_out" && (t?.status ?? "active") !== "inactive";
      const leaveDate  = fmtDate(t?.leavingDate as string);
      const statusHtml = isActive
        ? `<span class="status-active">&#9679; Active</span>`
        : `<span class="status-checkout">&#9679; Checked out ${leaveDate}</span>`;

      return `
<div class="tenant">
  <div class="photos">
    ${t?.photoUrl
      ? `<img class="avatar" src="${t.photoUrl}" alt="${String(t?.name ?? "")}" />`
      : `<div class="avatar-ph">${initials}</div>`
    }
    ${t?.idPhotoUrl
      ? `<div class="id-wrap"><span class="id-label">ID Proof</span><img class="idphoto" src="${t.idPhotoUrl as string}" alt="ID" /></div>`
      : ""
    }
  </div>
  <div class="tinfo">
    <div class="tname">${String(t?.name ?? p.tenantName ?? "Unknown")} ${statusHtml}</div>
    <div class="grid">
      <div class="field"><label>Phone</label><span>${String(t?.phone ?? "—")}</span></div>
      <div class="field"><label>Alt Phone</label><span>${String(t?.altPhone ?? "—")}</span></div>
      <div class="field"><label>Emergency Contact</label><span>${String(t?.emergencyContact ?? "—")} ${t?.emergencyRelation ? "(" + String(t.emergencyRelation) + ")" : ""}</span></div>
      <div class="field"><label>Joining Date</label><span>${joinDate}</span></div>
      <div class="field"><label>Floor · Room · Bed</label><span>FL ${room?.floor ?? p.floor ?? "—"} · ${room?.roomNumber ?? p.roomNumber ?? "—"} · Bed ${bed?.bedNumber ?? "—"}</span></div>
      <div class="field"><label>Sharing Type</label><span>${room?.sharingType ?? "—"}-sharing</span></div>
      <div class="field"><label>Advance / Deposit</label><span>${fmtRs(advAmt)}<span class="date-note"> paid on ${joinDate}</span></span></div>
      <div class="field"><label>Deposit Deducted</label><span>${fmtRs(dedAmt)}</span></div>
    </div>
    <div class="rent-section">
      <div class="field"><label>Monthly Rent</label><span>${fmtRs(p.amount)}</span></div>
      <div class="field"><label>Paid (${monthStr})</label><span>${fmtRs(p.paidAmount)}</span></div>
      <div class="field"><label>Remaining</label><span>${fmtRs(due)}</span></div>
      <span class="badge ${badgeCls}">${badgeTxt}</span>
      ${t?.paymentMode ? `<span class="pay-mode">via ${String(t.paymentMode)}</span>` : ""}
    </div>
  </div>
</div>`;
    };

    const floorSections = floorGroups.map(([floorNum, fRows]) => {
      const fTotal     = fRows.reduce((s, r) => s + r.p.amount, 0);
      const fCollected = fRows.reduce((s, r) => s + r.p.paidAmount, 0);
      const fPaid      = fRows.filter(r => r.p.status === "paid").length;
      return `
<div class="floor-section">
  <div class="floor-heading">
    <span class="floor-title">Floor — ${floorNum}</span>
    <span class="floor-meta">${fRows.length} tenant${fRows.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Collected <strong>${fmtRs(fCollected)}</strong> / ${fmtRs(fTotal)} &nbsp;·&nbsp; ${fPaid}/${fRows.length} paid</span>
  </div>
  ${fRows.map(r => renderTenant(r.p, r.d)).join("\n")}
</div>`;
    }).join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Rent Report – ${monthStr}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
  body { background: #fff; color: #111; font-size: 12px; padding: 24px; }
  h1  { font-size: 22px; font-weight: 900; letter-spacing: 1px; margin-bottom: 4px; }
  h2  { font-size: 13px; color: #555; font-weight: 400; margin-bottom: 18px; }
  .summary { display: flex; gap: 24px; margin-bottom: 24px; padding: 14px 18px;
             background: #f4f4f4; border-radius: 10px; flex-wrap: wrap; }
  .sumItem label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #777; display: block; }
  .sumItem span  { font-size: 16px; font-weight: 800; }
  .green { color: #16a34a; } .red { color: #dc2626; }
  .divider { border: none; border-top: 2px solid #e5e7eb; margin: 20px 0; }
  .floor-section { margin-bottom: 32px; }
  .floor-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
    background: #1a1a2e; color: #fff; padding: 10px 16px; border-radius: 10px; margin-bottom: 12px;
    page-break-after: avoid; }
  .floor-title { font-size: 15px; font-weight: 900; letter-spacing: 0.5px; }
  .floor-meta  { font-size: 11px; color: #a0aec0; }
  .floor-meta strong { color: #68d391; }
  .tenant { page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 10px;
            padding: 14px 16px; margin-bottom: 12px; display: flex; gap: 16px; }
  .photos { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; }
  .avatar { width: 72px; height: 72px; border-radius: 8px; object-fit: cover;
             border: 1px solid #e5e7eb; background: #f0f0f0; display: block; }
  .avatar-ph { width: 72px; height: 72px; border-radius: 8px; background: #d1fae5;
               display: flex; align-items: center; justify-content: center;
               font-size: 26px; font-weight: 900; color: #16a34a; }
  .id-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .id-label { font-size: 7.5px; color: #999; text-transform: uppercase; letter-spacing: .6px; }
  .idphoto { width: 72px; height: 48px; border-radius: 5px; object-fit: cover;
              border: 1px solid #e5e7eb; display: block; }
  .tinfo { flex: 1; min-width: 0; }
  .tname { font-size: 15px; font-weight: 800; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .status-active   { font-size: 10px; font-weight: 700; color: #16a34a; background: #dcfce7; border-radius: 20px; padding: 2px 8px; white-space: nowrap; }
  .status-checkout { font-size: 10px; font-weight: 700; color: #dc2626; background: #fee2e2; border-radius: 20px; padding: 2px 8px; white-space: nowrap; }
  .grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px 14px; }
  .field label { font-size: 8.5px; color: #888; text-transform: uppercase; letter-spacing:.8px; display: block; }
  .field span  { font-size: 11.5px; font-weight: 600; }
  .date-note { font-size: 9.5px; font-weight: 400; color: #666; margin-left: 5px; }
  .rent-section { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e5e7eb;
                  display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
  .badge { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px; }
  .badge-paid    { background: #dcfce7; color: #16a34a; }
  .badge-partial { background: #fef3c7; color: #b45309; }
  .badge-pending { background: #fee2e2; color: #dc2626; }
  .pay-mode { font-size: 10px; color: #666; }
  @media print {
    body { padding: 12px; }
    .tenant { break-inside: avoid; }
    .floor-section { break-inside: avoid; }
    .floor-heading { break-after: avoid; background: #1a1a2e !important;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 14mm; }
  }
</style>
</head>
<body>
<h1>Rent Report</h1>
<h2>${monthStr} &nbsp;·&nbsp; ${payments.length} Tenants</h2>
<div class="summary">
  <div class="sumItem"><label>Total Rent</label><span>${fmtRs(totalRent)}</span></div>
  <div class="sumItem"><label>Collected</label><span class="green">${fmtRs(collected)}</span></div>
  <div class="sumItem"><label>Pending</label><span class="red">${fmtRs(pending)}</span></div>
  <div class="sumItem"><label>Paid Tenants</label><span class="green">${paidCount} / ${payments.length}</span></div>
</div>
<hr class="divider">
${floorSections}
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;
  }

  // ─── Download PDF ─────────────────────────────────────────────────────
  async function handlePrint() {
    if (!pgId || payments.length === 0) return;
    setPrinting(true);
    try {
      const html = await buildReportHTML();
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    } finally { setPrinting(false); }
  }

  // ─── Share PDF file via native OS share sheet ─────────────────────────
  // This is the ONLY way to share a file to WhatsApp/Telegram from a browser.
  // wa.me and t.me URLs can only carry text — NOT files.
  async function handleShare() {
    if (!pgId || payments.length === 0) return;
    setPrinting(true);
    try {
      const html = await buildReportHTML();
      const blob = new Blob([html], { type: "text/html" });
      const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const [yr, mo] = month.split("-");
      const monthStr = `${MONTHS[parseInt(mo)-1]} ${yr}`;
      const fileName = `Rent-Report-${monthStr.replace(" ", "-")}.html`;
      const file = new File([blob], fileName, { type: "text/html" });

      // Try native file share (Android Chrome / iOS Safari — includes WA, Telegram etc.)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Rent Report – ${monthStr}`,
          text: `Rent report for ${monthStr}`,
        });
      } else {
        // Desktop fallback: just download the file
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        alert("File downloaded! Open WhatsApp or Telegram and attach the file to share.");
      }
    } finally { setPrinting(false); }
  }


  return (
    <div className={styles.page}>
      {/* ─── Header ─── */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>←</button>
        <h1 className={styles.headerTitle}>💵 Rents</h1>
      </div>

      <div className={styles.content}>
        {/* ─── Month selector ─── */}
        <div className={styles.monthRow}>
          <span className={styles.monthLabel}>{monthLabel(month)}</span>
          <select className={styles.monthSelect} value={month} onChange={e => setMonth(e.target.value)}>
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* ─── Loading ─── */}
        {loading && <div className={styles.spinner} />}

        {!loading && (
          <>
            {/* ─── Generate banner (if no records) ─── */}
            {payments.length === 0 && (
              <div className={styles.generateBanner}>
                <div className={styles.generateText}>
                  <strong>No rent records for {monthLabel(month)}</strong>
                  Generate records for all active tenants.
                </div>
                <button className={styles.generateBtn} disabled={generating} onClick={handleGenerate}>
                  {generating ? "Generating…" : "Generate ✦"}
                </button>
              </div>
            )}

            {/* ─── Summary card ─── */}
            {payments.length > 0 && (
              <div className={styles.summaryCard}>
                <DonutChart collected={collected} pending={pending} total={totalRent} />

                <div className={styles.statsRow}>
                  <div className={styles.statItem}>
                    <div className={styles.statAmt}>{fmt(totalRent)}</div>
                    <div className={styles.statLabel}>Total</div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statAmt} style={{ color: "#2dc653" }}>{fmt(collected)}</div>
                    <div className={styles.statLabel}>Collected</div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statAmt} style={{ color: "#e63946" }}>{fmt(pending)}</div>
                    <div className={styles.statLabel}>Pending</div>
                  </div>
                </div>

                <div className={styles.tenantBadge}>
                  <span>{paidCount}</span> / {payments.length} tenants paid
                </div>
              </div>
            )}

            {/* ─── Floor-wise grid ─── */}
            {floors.length > 0 && (
              <>
                <div className={styles.sectionTitle}>Floor-wise</div>
                <div className={styles.floorGrid}>
                  {floors.map(([floor, fps]) => {
                    const fTotal     = fps.reduce((s, p) => s + p.amount, 0);
                    const fCollected = fps.reduce((s, p) => s + p.paidAmount, 0);
                    const fPct       = fTotal > 0 ? Math.round((fCollected / fTotal) * 100) : 0;
                    return (
                      <div key={floor} className={styles.floorCard} onClick={() => setSelectedFloor(floor)}>
                        <div className={styles.floorCardTitle}>Floor {floor}</div>
                        <div className={styles.floorCardMeta}>{fps.length} tenant{fps.length !== 1 ? "s" : ""}</div>
                        <div className={styles.floorCardAmts}>
                          <span>{fmt(fCollected)}</span> / {fmt(fTotal)}
                        </div>
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${fPct}%` }} />
                        </div>
                        <div className={styles.floorPct}>{fPct}% collected</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ─── Export dropdown ─── */}
            {payments.length > 0 && (
              <div className={styles.exportRow} ref={exportRef}>
                {showExport && (
                  <div className={styles.exportDropdown}>
                    {/* Download PDF */}
                    <button className={`${styles.exportOption} ${styles.exportDownload}`}
                      onClick={() => { setShowExport(false); handlePrint(); }}
                      disabled={printing}>
                      💾 {printing ? "Preparing…" : "Download PDF"}
                    </button>
                    {/* Share via native OS share sheet — attaches the actual file to WA/Telegram */}
                    <button className={styles.exportOption}
                      onClick={() => { setShowExport(false); handleShare(); }}
                      disabled={printing}>
                      <svg viewBox="0 0 32 32" width="20" height="20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                        <circle cx="16" cy="16" r="16" fill="#25D366"/>
                        <path fill="#fff" d="M23.5 8.5A10.44 10.44 0 0 0 16 5.5C10.2 5.5 5.5 10.2 5.5 16a10.4 10.4 0 0 0 1.4 5.2L5.5 26.5l5.4-1.4a10.5 10.5 0 0 0 5.1 1.3c5.8 0 10.5-4.7 10.5-10.5a10.4 10.4 0 0 0-3-7.4zm-7.5 16.1a8.7 8.7 0 0 1-4.5-1.2l-.3-.2-3.2.8.9-3.1-.2-.3A8.7 8.7 0 0 1 7.3 16a8.7 8.7 0 0 1 8.7-8.7 8.7 8.7 0 0 1 8.7 8.7 8.7 8.7 0 0 1-8.7 8.6zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7 7 0 0 1-1.3-1.6c-.1-.3 0-.4.1-.6l.4-.5.3-.4v-.4l-.9-2.1c-.2-.5-.5-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8c.1.2 1.5 2.4 3.8 3.3a13 13 0 0 0 1.3.5 3.1 3.1 0 0 0 1.4.1c.4-.1 1.3-.5 1.5-1s.2-1 .1-1a.5.5 0 0 0-.4-.3z"/>
                      </svg>
                      Share via WhatsApp / Telegram
                    </button>
                  </div>
                )}
                <button className={styles.exportBtn}
                  onClick={() => setShowExport(v => !v)}
                  disabled={printing}
                  id="btn-export">
                  🖨️ {printing ? "Preparing…" : "Print / Export"} ▴
                </button>
              </div>
            )}



            {/* ─── Empty state if no payments and past month ─── */}
            {payments.length === 0 && month !== currentMonthValue() && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📭</div>
                No rent records found for {monthLabel(month)}.
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Floor modal ─── */}
      {selectedFloor !== null && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setSelectedFloor(null)} />
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleWrap}>
                <div className={styles.modalTitle}>Floor {selectedFloor}</div>
                <div className={styles.modalSubtitle}>
                  {floorModalPayments.length} tenant{floorModalPayments.length !== 1 ? "s" : ""} ·{" "}
                  {fmt(floorModalPayments.reduce((s, p) => s + p.paidAmount, 0))} /{" "}
                  {fmt(floorModalPayments.reduce((s, p) => s + p.amount, 0))} collected
                </div>
              </div>
              <button className={styles.modalClose} onClick={() => setSelectedFloor(null)}>✕</button>
            </div>
            <div className={styles.tenantList}>
              {floorModalPayments
                .sort((a, b) => (a.status === "paid" ? 1 : -1) - (b.status === "paid" ? 1 : -1))
                .map(p => (
                  <TenantRow key={p.id} p={p} onNavigate={id => {
                    setSelectedFloor(null);
                    router.push(`/tenants/profile?id=${id}`);
                  }} />
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

