"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function PaymentPage() {
  const router = useRouter();
  const { owner, token } = useAuth();

  const [pgId, setPgId] = useState<string | null>(null);
  const [upiId, setUpiId] = useState("");
  const [payPhone, setPayPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const authHeader = useCallback((): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {}, [token]);

  useEffect(() => {
    if (!owner || !token) return;
    async function load() {
      setLoading(true); setError("");
      try {
        const res = await fetch(`${API_URL}/api/pgs/owner/${owner!.id}`, { headers: authHeader() });
        const json = await res.json();
        const firstPg = json.pgs?.[0];
        if (!firstPg) { setError("No PG found. Create a PG first."); setLoading(false); return; }
        setPgId(firstPg.id);
        const r2 = await fetch(`${API_URL}/api/pgs/${firstPg.id}/payment`, { headers: authHeader() });
        const j2 = await r2.json();
        setUpiId(j2.paymentUpiId || "");
        setPayPhone(j2.paymentPhone || "");
      } catch { setError("Failed to load payment info."); }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, token]);

  async function handleSave() {
    if (!pgId) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/pgs/${pgId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          paymentUpiId: upiId.trim() || null,
          paymentPhone: payPhone.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSuccess("✅ Payment details saved!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    setSaving(false);
  }

  if (!owner) return null;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()} id="btn-back">← Back</button>
        <div className={styles.logo}><span className={styles.logoPG}>PG</span><span className={styles.logoDash}>-</span><span className={styles.logoEG}>EG</span></div>
      </header>
      <div className={styles.content}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>💳 Payment Setup</h1>
          <p className={styles.subtitle}>Add your UPI ID and collection number so tenants can pay you easily via rent reminders.</p>
        </div>

        {loading ? (
          <div className={styles.loadingRow}><span className={styles.spinnerLg} /></div>
        ) : (<>
          {/* UPI ID */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>UPI ID</p>
            <p className={styles.sectionHint}>e.g. yourname@okicici, yourname@upi — tenants will copy & pay directly</p>
            <div className={styles.upiInputWrap}>
              <span className={styles.upiIcon}>💸</span>
              <input
                id="input-upi"
                type="text"
                className={styles.upiInput}
                value={upiId}
                onChange={e => setUpiId(e.target.value)}
                placeholder="e.g. samur@okicici"
              />
            </div>
          </div>

          {/* Collection Phone */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Rent Collection Number</p>
            <p className={styles.sectionHint}>Mobile number linked to GPay / PhonePe — tenants can copy & pay directly</p>
            <div className={styles.upiInputWrap}>
              <span className={styles.upiIcon}>📱</span>
              <input
                id="input-pay-phone"
                type="tel"
                className={styles.upiInput}
                value={payPhone}
                onChange={e => setPayPhone(e.target.value)}
                placeholder="e.g. 6281975993"
              />
            </div>
          </div>

          {error && <p className={styles.errorMsg}>⚠️ {error}</p>}
          {success && <p className={styles.successMsg}>{success}</p>}

          <button className={styles.saveBtn} onClick={handleSave} disabled={saving} id="btn-save-payment">
            {saving ? <><span className={styles.spinnerDark} /> Saving…</> : "✅ SAVE PAYMENT DETAILS"}
          </button>

          {/* Preview */}
          {(upiId || payPhone) && (
            <div className={styles.previewCard}>
              <p className={styles.previewTitle}>Preview — How tenants will receive this</p>
              <div className={styles.previewBody}>
                {upiId && <p className={styles.previewUpi}>💸 UPI ID: <strong>{upiId}</strong></p>}
                {payPhone && <p className={styles.previewUpi}>📱 Number: <strong>{payPhone}</strong></p>}
              </div>
            </div>
          )}
        </>)}
      </div>
    </main>
  );
}
