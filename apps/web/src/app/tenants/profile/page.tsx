"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLogo from "@/components/AppLogo";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`;
}
function fmt(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

interface Transaction { id: string; amount: number; paymentMode: string; note?: string; createdAt: string; }
interface RentRecord { id: string; month: string; amount: number; paidAmount: number; status: string; paymentMode?: string | null; paidAt?: string | null; transactions: Transaction[]; }
interface TenantProfile {
  id: string; name: string; phone: string;
  altPhone?: string | null; emergencyContact?: string | null; emergencyRelation?: string | null;
  photoUrl?: string | null; idPhotoUrl?: string | null;
  joiningDate: string; leavingDate?: string | null;
  rentAmount?: number; advanceAmount?: number; paymentMode?: string | null;
  status: string;
}
interface Bed { id: string; bedNumber: number; }
interface Room { id: string; roomNumber: string; floor: number; sharingType: number; }
interface ProfileData { tenant: TenantProfile; bed: Bed | null; room: Room | null; rentRecords: RentRecord[]; }

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function TenantProfileInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantId = params.get("id");
  const { token, isLoading: authLoading, isAuthenticated } = useAuth();

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Rent payment state
  const [rentPayMode, setRentPayMode] = useState<"cash" | "upi">("cash");
  const [rentPayAmount, setRentPayAmount] = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);
  const [payError, setPayError] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) { setError("No tenant ID"); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/tenants/${tenantId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tenantId, token]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.replace("/sign-in"); return; }
    load();
  }, [load, authLoading, isAuthenticated, router]);

  // Current month rent record
  const currentMonth = currentMonthStr();
  const currentRent = data?.rentRecords.find((r) => r.month === currentMonth);
  const remaining = currentRent ? currentRent.amount - (currentRent.paidAmount || 0) : 0;

  async function handleMarkPaid() {
    if (!currentRent) return;
    setPayError("");
    const payingNow = parseInt(rentPayAmount) || remaining;
    if (payingNow <= 0) { setPayError("Enter a valid amount"); return; }
    setMarkingPaid(true);
    try {
      const res = await fetch(`${API_URL}/api/rent/${currentRent.id}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ paymentMode: rentPayMode, amount: payingNow }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setRentPayAmount("");
      await load();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setMarkingPaid(false);
    }
  }

  if (loading) return (
    <main className={styles.main}>
      <div className={styles.centered}><span className={styles.spinner} /></div>
    </main>
  );

  if (error || !data) return (
    <main className={styles.main}>
      <div className={styles.centered}>
        <p className={styles.errorText}>{error || "Tenant not found"}</p>
        <button className={styles.backBtn} onClick={() => router.back()}>← Go Back</button>
      </div>
    </main>
  );

  const { tenant, bed, room } = data;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/dashboard")} id="btn-back">← Dashboard</button>
        <AppLogo size="sm" />
      </header>

      {/* Hero — photo */}
      <div className={styles.heroWrap}>
        {tenant.photoUrl
          ? <img src={tenant.photoUrl} alt={tenant.name} className={styles.heroPhoto} />
          : <div className={styles.heroPlaceholder}><span>👤</span></div>
        }
        <div className={styles.heroGradient} />
        <div className={styles.heroName}>
          <h1 className={styles.tenantName}>{tenant.name}</h1>
          <span className={`${styles.statusBadge} ${tenant.status === "active" ? styles.statusActive : styles.statusOut}`}>
            {tenant.status === "active" ? "● ACTIVE" : "● CHECKED OUT"}
          </span>
        </div>
      </div>

      <div className={styles.content}>

        {/* ── Contact ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>📞 Contact</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Primary</span>
              <span className={styles.infoValue}>+91 {tenant.phone}</span>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Alternate</span>
              <span className={styles.infoValue} style={{ color: tenant.altPhone ? "var(--text-primary)" : "var(--text-muted)" }}>
                {tenant.altPhone ? `+91 ${tenant.altPhone}` : "—"}
              </span>
            </div>
            {/* Emergency contact — full width, always visible */}
            <div className={styles.infoCard} style={{
              gridColumn: "1 / -1",
              borderColor: tenant.emergencyContact ? "rgba(244,162,97,0.4)" : "var(--border)",
              background: tenant.emergencyContact ? "rgba(244,162,97,0.06)" : undefined,
            }}>
              <span className={styles.infoLabel}>
                🆘 Emergency Contact{tenant.emergencyRelation ? ` · ${tenant.emergencyRelation}` : ""}
              </span>
              <span className={styles.infoValue} style={{ color: tenant.emergencyContact ? "#f4a261" : "var(--text-muted)", fontSize: 16 }}>
                {tenant.emergencyContact ? `+91 ${tenant.emergencyContact}` : "Not provided"}
              </span>
            </div>
          </div>
        </section>

        {/* ── Stay Details ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🏠 Stay Details</h2>
          <div className={styles.infoGrid}>
            {room && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>Room · Bed</span>
                <span className={styles.infoValue}>{room.roomNumber} · Bed {bed?.bedNumber}</span>
              </div>
            )}
            {room && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>Floor</span>
                <span className={styles.infoValue}>{room.floor}</span>
              </div>
            )}
            {room && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>Sharing</span>
                <span className={styles.infoValue}>{room.sharingType}-Bed</span>
              </div>
            )}
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Joined</span>
              <span className={styles.infoValue}>{fmt(tenant.joiningDate)}</span>
            </div>
            {tenant.leavingDate && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>Left</span>
                <span className={styles.infoValue}>{fmt(tenant.leavingDate)}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Money ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>💰 Money</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Monthly Rent</span>
              <span className={styles.infoValue}>₹{(tenant.rentAmount || 0).toLocaleString()}</span>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Deposit</span>
              <span className={styles.infoValue}>{tenant.advanceAmount ? `₹${tenant.advanceAmount.toLocaleString()}` : "—"}</span>
            </div>
            {tenant.paymentMode && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>Deposit Mode</span>
                <span className={styles.infoValue} style={{ textTransform: "uppercase" }}>{tenant.paymentMode}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Current Month Rent ── */}
        {currentRent && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>📅 {monthLabel(currentMonth)} Rent</h2>

            {currentRent.status === "paid" ? (
              <div className={styles.rentPaidCard}>
                <span>✅ FULLY PAID</span>
                <span>₹{(currentRent.paidAmount || 0).toLocaleString()}</span>
              </div>
            ) : (
              <>
                {/* Progress bar */}
                <div className={styles.rentProgressWrap}>
                  <div className={styles.rentProgressBar}>
                    <div
                      className={styles.rentProgressFill}
                      style={{ width: `${Math.min(100, ((currentRent.paidAmount || 0) / currentRent.amount) * 100)}%` }}
                    />
                  </div>
                  <div className={styles.rentProgressLabels}>
                    <span style={{ color: "#2dc653" }}>Paid: ₹{(currentRent.paidAmount || 0).toLocaleString()}</span>
                    <span style={{ color: "#e63946" }}>Remaining: ₹{remaining.toLocaleString()}</span>
                  </div>
                </div>

                {/* Partial payment form */}
                <p className={styles.fieldLabel}>Amount receiving now</p>
                <div className={styles.rentAmountRow}>
                  <span className={styles.rentAmountPrefix}>₹</span>
                  <input
                    type="number"
                    className={styles.rentAmountInput}
                    placeholder={`Full remaining: ${remaining.toLocaleString()}`}
                    value={rentPayAmount}
                    onChange={(e) => setRentPayAmount(e.target.value)}
                    inputMode="numeric"
                    id="input-rent-amount"
                  />
                </div>
                <p className={styles.fieldLabel} style={{ marginTop: 12 }}>Payment mode</p>
                <div className={styles.paymentRow}>
                  <button className={`${styles.payBtn} ${rentPayMode === "cash" ? styles.payBtnActive : ""}`}
                    onClick={() => setRentPayMode("cash")}>💵 CASH</button>
                  <button className={`${styles.payBtn} ${rentPayMode === "upi" ? styles.payBtnActive : ""}`}
                    onClick={() => setRentPayMode("upi")}>📱 UPI</button>
                </div>
                {payError && <p className={styles.payError}>⚠️ {payError}</p>}
                <button
                  className={styles.markPaidBtn}
                  onClick={handleMarkPaid}
                  disabled={markingPaid}
                  id="btn-mark-paid"
                >
                  {markingPaid
                    ? <><span className={styles.spinnerDark} /> Processing…</>
                    : `💵 MARK AS PAID · ₹${(parseInt(rentPayAmount) || remaining).toLocaleString()}`}
                </button>
              </>
            )}

            {/* Payment history for current month */}
            {currentRent.transactions.length > 0 && (
              <div className={styles.txnList}>
                <p className={styles.txnListTitle}>Payment history this month</p>
                {currentRent.transactions.map((txn) => (
                  <div key={txn.id} className={styles.txnRow}>
                    <div className={styles.txnLeft}>
                      <span className={styles.txnIcon}>{txn.paymentMode === "upi" ? "📱" : "💵"}</span>
                      <div>
                        <p className={styles.txnAmount}>₹{txn.amount.toLocaleString()}</p>
                        <p className={styles.txnMeta}>{txn.paymentMode?.toUpperCase()} · {fmt(txn.createdAt)} {fmtTime(txn.createdAt)}</p>
                      </div>
                    </div>
                    {txn.note && <span className={styles.txnNote}>{txn.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Past Months ── */}
        {data.rentRecords.filter((r) => r.month !== currentMonth).length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>📜 Payment History</h2>
            {data.rentRecords.filter((r) => r.month !== currentMonth).map((rec) => (
              <div key={rec.id} className={styles.pastMonthCard}>
                <div className={styles.pastMonthHeader}>
                  <span className={styles.pastMonthLabel}>{monthLabel(rec.month)}</span>
                  <span className={`${styles.pastMonthStatus} ${rec.status === "paid" ? styles.pastPaid : styles.pastPending}`}>
                    {rec.status === "paid" ? "✅ PAID" : rec.status === "partial" ? "⚠️ PARTIAL" : "❌ PENDING"}
                  </span>
                  <span className={styles.pastMonthAmount}>₹{(rec.paidAmount || 0).toLocaleString()} / ₹{rec.amount.toLocaleString()}</span>
                </div>
                {rec.transactions.length > 0 && (
                  <div className={styles.pastTxns}>
                    {rec.transactions.map((txn) => (
                      <div key={txn.id} className={styles.pastTxnRow}>
                        <span>{txn.paymentMode === "upi" ? "📱" : "💵"} ₹{txn.amount.toLocaleString()}</span>
                        <span className={styles.pastTxnDate}>{fmt(txn.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── ID Card ── */}
        {tenant.idPhotoUrl && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>🪪 ID Card</h2>
            <img src={tenant.idPhotoUrl} alt="ID Card" className={styles.idCard} />
          </section>
        )}

      </div>
    </main>
  );
}

export default function TenantProfilePage() {
  return <Suspense fallback={null}><TenantProfileInner /></Suspense>;
}
