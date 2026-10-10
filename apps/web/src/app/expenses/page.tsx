"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface Expense {
  id: string;
  item: string;
  amount: string;
  date: string;
  createdAt: string;
}

// ─── Pure SVG Bar Chart ────────────────────────────────────────────────────
function BarChart({ monthTotals, year }: { monthTotals: number[]; year: number }) {
  const W = 600, H = 260, PAD = { top: 30, right: 20, bottom: 45, left: 60 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...monthTotals, 1);
  const barW = innerW / 12 - 8;
  const now = new Date();
  const curMonth = now.getFullYear() === year ? now.getMonth() : -1;

  // Y axis ticks (5 lines)
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxVal / ticks) * i));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" className={styles.barSvg}>
      {/* Grid lines */}
      {yTicks.map((v, i) => {
        const y = PAD.top + innerH - (v / maxVal) * innerH;
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y}
              stroke="var(--border-hover)" strokeWidth="1" strokeOpacity="0.5" />
            <text x={PAD.left - 8} y={y + 5} textAnchor="end"
              fill="var(--text-secondary)" fontSize="14" fontWeight="600">
              {v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {monthTotals.map((val, i) => {
        const x = PAD.left + i * (innerW / 12) + 4;
        const barH = val > 0 ? Math.max(4, (val / maxVal) * innerH) : 0;
        const y = PAD.top + innerH - barH;
        const isCurrent = i === curMonth;
        const isEmpty = val === 0;

        return (
          <g key={i}>
            {/* Bar */}
            <rect
              x={x} y={y} width={barW} height={barH}
              rx="5" ry="5"
              fill={isCurrent
                ? "url(#barGradActive)"
                : isEmpty ? "var(--border)" : "url(#barGrad)"}
            />
            {/* Amount label on top */}
            {val > 0 && (
              <text x={x + barW / 2} y={y - 8} textAnchor="middle"
                fill={isCurrent ? "#d97706" : "var(--text-primary)"} fontSize="13" fontWeight="700">
                {val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
              </text>
            )}
            {/* Month label */}
            <text x={x + barW / 2} y={H - PAD.bottom + 20} textAnchor="middle"
              fill={isCurrent ? "#6366f1" : "var(--text-primary)"} fontSize="14"
              fontWeight={isCurrent ? "800" : "600"}>
              {MONTHS[i]}
            </text>
          </g>
        );
      })}

      {/* Gradients */}
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="barGradActive" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
          <stop offset="100%" stopColor="#d97706" stopOpacity="0.7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
function ExpensesInner() {
  const router = useRouter();
  const { activePgId, token } = useAuth();

  const year = new Date().getFullYear();
  const todayStr = new Date().toISOString().slice(0, 10);
  const curMonthIdx = new Date().getMonth();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [filterMonth, setFilterMonth] = useState(curMonthIdx);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const authHeader = useCallback(() =>
    token ? { Authorization: `Bearer ${token}` } : {} as Record<string, string>,
  [token]);

  const load = useCallback(async () => {
    if (!activePgId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/expenses/${activePgId}?year=${year}`, {
        headers: authHeader(),
      });
      const j = await res.json();
      setExpenses(j.expenses ?? []);
    } catch { setError("Failed to load expenses."); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePgId, token]);

  useEffect(() => { load(); }, [load]);

  // Month totals for bar chart
  const monthTotals = Array.from({ length: 12 }, (_, mi) => {
    return expenses
      .filter(e => new Date(e.date).getMonth() === mi)
      .reduce((s, e) => s + parseFloat(e.amount), 0);
  });

  const totalYear = monthTotals.reduce((a, b) => a + b, 0);

  // Expenses for selected month
  const filtered = expenses.filter(e => new Date(e.date).getMonth() === filterMonth);
  const monthTotal = monthTotals[filterMonth] || 0;

  async function handleAdd() {
    const trimmed = item.trim();
    if (!trimmed) { setError("Please enter an item name."); return; }
    // Must contain at least one letter — no pure numbers
    if (!/[a-zA-Z]/.test(trimmed)) {
      setError("Item name must contain letters, not just numbers."); return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount."); return;
    }
    if (!activePgId) return;
    setAdding(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/expenses/${activePgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ item: trimmed, amount: parseFloat(amount), date }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setExpenses(prev => [j.expense, ...prev]);
      setItem(""); setAmount(""); setDate(todayStr);
      setFilterMonth(new Date(date).getMonth());
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    setAdding(false);
  }

  function handleDelete(exp: Expense) {
    setConfirmDelete(exp);
  }

  async function doDelete() {
    if (!confirmDelete || !activePgId) return;
    setDeleting(true);
    try {
      await fetch(`${API_URL}/api/expenses/${activePgId}/${confirmDelete.id}`, {
        method: "DELETE", headers: authHeader(),
      });
      setExpenses(prev => prev.filter(e => e.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch { setError("Delete failed."); }
    setDeleting(false);
  }

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()} id="btn-back">← Back</button>
        <div className={styles.logo}>
          <span className={styles.logoPG}>PG</span>
          <span className={styles.logoDash}>-</span>
          <span className={styles.logoEG}>EG</span>
        </div>
      </header>

      <div className={styles.content}>
        {/* Title + year total */}
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>📊 Expenses</h1>
            <p className={styles.subtitle}>track everything you spend on your PG</p>
          </div>
          <div className={styles.totalsContainer}>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Total {year}:</span>
              <span className={styles.totalAmt}>₹{totalYear.toLocaleString("en-IN")}</span>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>{MONTHS[filterMonth]} Total:</span>
              <span className={styles.totalAmt} style={{ color: "#6366f1" }}>₹{monthTotal.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <span className={styles.chartTitle}>Monthly Spending — {year}</span>
            <span className={styles.chartLegend}><span className={styles.dotActive} /> This month</span>
          </div>
          {loading ? (
            <div className={styles.chartLoading}><span className={styles.spinner} /></div>
          ) : (
            <div
              className={styles.chartWrap}
              onClick={e => {
                // clicking a bar: detect month by x position
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const x = e.clientX - rect.left;
                const mi = Math.floor((x / rect.width) * 12);
                if (mi >= 0 && mi < 12) setFilterMonth(mi);
              }}
            >
              <BarChart monthTotals={monthTotals} year={year} />
            </div>
          )}
          <div className={styles.monthTabs}>
            {MONTHS.map((mo, i) => (
              <button
                key={i}
                className={`${styles.monthTab} ${i === filterMonth ? styles.monthTabActive : ""}`}
                onClick={() => setFilterMonth(i)}
              >{mo}</button>
            ))}
          </div>
        </div>

        {/* Add expense form */}
        <div className={styles.formCard}>
          <p className={styles.formTitle}>➕ Add Expense</p>
          {error && <p className={styles.errorMsg}>⚠️ {error}</p>}
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Item</label>
              <input
                id="input-item"
                type="text"
                className={styles.fieldInput}
                placeholder="e.g. Electricity bill, Cleaning, Repair…"
                value={item}
                onChange={e => setItem(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className={styles.formFieldSm}>
              <label className={styles.fieldLabel}>Amount (₹)</label>
              <input
                id="input-amount"
                type="number"
                min="1"
                className={styles.fieldInput}
                placeholder="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className={styles.formFieldSm}>
              <label className={styles.fieldLabel}>Date</label>
              <input
                id="input-date"
                type="date"
                className={styles.fieldInput}
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>
          <button
            className={styles.addBtn}
            onClick={handleAdd}
            disabled={adding}
            id="btn-add-expense"
          >
            {adding ? <><span className={styles.spinnerSm} /> Adding…</> : "✅ Add Expense"}
          </button>
        </div>

        {/* Monthly list */}
        <div className={styles.listCard}>
          <div className={styles.listHeader}>
            <span className={styles.listTitle}>{MONTH_FULL[filterMonth]} Expenses</span>
            <span className={styles.listTotal}>₹{monthTotal.toLocaleString("en-IN")}</span>
          </div>
          {loading ? (
            <div className={styles.listLoading}><span className={styles.spinner} /></div>
          ) : filtered.length === 0 ? (
            <p className={styles.emptyMsg}>No expenses for {MONTH_FULL[filterMonth]} yet.</p>
          ) : (
            <div className={styles.expenseList}>
              {filtered.map(exp => (
                <div key={exp.id} className={styles.expRow}>
                  <div className={styles.expLeft}>
                    <span className={styles.expItem}>{exp.item}</span>
                    <span className={styles.expDate}>
                      {new Date(exp.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div className={styles.expRight}>
                    <span className={styles.expAmt}>₹{parseFloat(exp.amount).toLocaleString("en-IN")}</span>
                    <button
                      className={styles.delBtn}
                      onClick={() => handleDelete(exp)}
                      title="Delete"
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Delete Confirm Modal ─── */}
      {confirmDelete && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDelete(null)}>
          <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
            <div className={styles.confirmIcon}>🗑️</div>
            <h3 className={styles.confirmTitle}>Delete Expense?</h3>
            <p className={styles.confirmBody}>
              <strong>{confirmDelete.item}</strong>
              <span className={styles.confirmAmt}> — ₹{parseFloat(confirmDelete.amount).toLocaleString("en-IN")}</span>
            </p>
            <p className={styles.confirmNote}>This cannot be undone.</p>
            <div className={styles.confirmBtns}>
              <button className={styles.confirmCancel} onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className={styles.confirmDel} onClick={doDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ExpensesPage() {
  return <Suspense fallback={null}><ExpensesInner /></Suspense>;
}
