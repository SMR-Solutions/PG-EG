"use client";
import AppLogo from "@/components/AppLogo";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const BED_LETTERS = "ABCDEFGHIJKLMNOP";

interface BedInfo {
  id: string;
  bedNumber: number;
  room: { id: string; roomNumber: string; sharingType: number; floor: number };
  pgId: string;
}

/* ─── Loading fallback ─── */
function LoadingScreen() {
  return (
    <main className={styles.main}>
      <div className={styles.centered}><span className={styles.spinner} /></div>
    </main>
  );
}

/* ─── Inner form — uses useSearchParams, must be inside Suspense ─── */
function CheckInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const bedId = params.get("bedId");
  const roomId = params.get("roomId");
  const { token, isLoading: authLoading } = useAuth();

  const selfieRef = useRef<HTMLInputElement>(null);
  const idCardRef = useRef<HTMLInputElement>(null);

  const [bedInfo, setBedInfo] = useState<BedInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [idUrl, setIdUrl] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("Father");
  const [joiningDate, setJoiningDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [monthlyRent, setMonthlyRent] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi">("cash");

  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingId, setUploadingId] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!bedId || !roomId || authLoading) { if (!authLoading) setLoading(false); return; }
    // Always use the active PG key — pg_eg_pg_id is the old single-PG key
    const pgId = localStorage.getItem("pg_eg_active_pg_id")
      || localStorage.getItem("pg_eg_pg_id")
      || "";
    if (!pgId) { setLoading(false); return; }
    fetch(`${API_URL}/api/dashboard?pgId=${pgId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        const room = data.rooms?.find((r: { id: string }) => r.id === roomId);
        if (room) {
          const bed = room.beds?.find((b: { id: string }) => b.id === bedId);
          if (bed) setBedInfo({ id: bedId, bedNumber: bed.bedNumber, room, pgId });
        }
      })
      .finally(() => setLoading(false));
  }, [bedId, roomId, token, authLoading]);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  async function handlePhoto(file: File, type: "selfie" | "id") {
    const b64 = await fileToBase64(file);
    const setPreview = type === "selfie" ? setSelfiePreview : setIdPreview;
    const setUrl = type === "selfie" ? setSelfieUrl : setIdUrl;
    const setUploading = type === "selfie" ? setUploadingPhoto : setUploadingId;
    const folder = type === "selfie" ? "pg-eg/tenants/selfies" : "pg-eg/tenants/ids";

    setPreview(b64);
    setUploading(true);
    try {
      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: b64, fileName: `${type}_${Date.now()}.jpg`, folder }),
      });
      const data = await res.json();
      setUrl(data.url || b64);
    } catch {
      setUrl(b64); // fallback: store locally if upload fails
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Enter tenant's full name"); return; }
    if (phone.replace(/\D/g, "").length < 10) { setError("Enter a valid 10-digit mobile number"); return; }
    if (!bedInfo) { setError("Bed info not loaded. Go back and try again."); return; }

    // ── Monetary validation ───────────────────────────────────────────
    const rawRent = monthlyRent.trim();
    const rawDeposit = depositAmount.trim();
    const rentVal = rawRent === "" ? 0 : Number(rawRent);
    const depositVal = rawDeposit === "" ? 0 : Number(rawDeposit);

    if (rawRent !== "" && (!Number.isFinite(rentVal) || rentVal < 0)) {
      setError("Monthly rent must be a positive amount"); return;
    }
    if (rawRent !== "" && !Number.isInteger(rentVal)) {
      setError("⚠️ Monthly rent: Please enter a whole rupee amount (no paise/decimals)"); return;
    }
    if (rawDeposit !== "" && (!Number.isFinite(depositVal) || depositVal < 0)) {
      setError("Deposit must be a positive amount"); return;
    }
    if (rawDeposit !== "" && !Number.isInteger(depositVal)) {
      setError("⚠️ Deposit: Please enter a whole rupee amount (no paise/decimals)"); return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          bedId: bedInfo.id,
          pgId: bedInfo.pgId,
          name: name.trim(),
          phone: phone.replace(/\D/g, "").slice(-10),
          altPhone: altPhone.replace(/\D/g, "").slice(-10) || undefined,
          emergencyContact: emergencyContact.replace(/\D/g, "").slice(-10) || undefined,
          emergencyRelation: emergencyContact ? emergencyRelation : undefined,
          joiningDate,
          rentAmount: rentVal,
          advanceAmount: depositVal,
          paymentMode,
          photoUrl: selfieUrl || null,
          idPhotoUrl: idUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check-in failed");
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingScreen />;

  if (success) return (
    <main className={styles.main}>
      <div className={styles.centered}>
        <div className={styles.successIcon}>🎉</div>
        <h2 className={styles.successTitle}>Checked In!</h2>
        <p className={styles.successSub}>Going back to dashboard…</p>
      </div>
    </main>
  );

  const bedLetter = bedInfo ? BED_LETTERS[bedInfo.bedNumber - 1] : "A";

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />
      <div className={styles.content}>

        {/* Header */}
        <header className={`${styles.header} animate-fade-up`}>
          <button className={styles.backBtn} onClick={() => router.back()} id="btn-back">← Back</button>
          <AppLogo />
        </header>

        {/* Context banner */}
        <div className={`${styles.contextBanner} animate-fade-up delay-1`}>
          <div className={styles.bannerIcon}>📥</div>
          <div>
            <p className={styles.bannerTitle}>
              CHECK-IN: Room {bedInfo?.room.roomNumber ?? "—"} · Bed {bedLetter}
            </p>
            <p className={styles.bannerSub}>Floor {bedInfo?.room.floor} · {bedInfo?.room.sharingType}-Sharing</p>
          </div>
        </div>

        {/* ── 1. Photos ── */}
        <div className={`${styles.section} animate-fade-up delay-2`}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>1</span>
            <span className={styles.sectionTitle}>Tenant Photo &amp; ID</span>
          </div>
          <div className={styles.photoRow}>
            {/* Selfie */}
            <button className={`${styles.photoBox} ${selfiePreview ? styles.photoBoxFilled : ""}`}
              onClick={() => selfieRef.current?.click()} id="btn-selfie">
              {uploadingPhoto
                ? <span className={styles.spinner} />
                : selfiePreview
                  ? <img src={selfiePreview} alt="Selfie" className={styles.photoThumb} />
                  : <><span className={styles.photoIcon}>📸</span><span className={styles.photoLabel}>SELFIE</span><span className={styles.photoHint}>Front camera</span></>}
              {selfiePreview && !uploadingPhoto && <div className={styles.photoOverlay}>✓ Change</div>}
            </button>
            <input ref={selfieRef} type="file" accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0], "selfie")} />

            {/* ID Card */}
            <button className={`${styles.photoBox} ${idPreview ? styles.photoBoxFilled : ""}`}
              onClick={() => idCardRef.current?.click()} id="btn-id-card">
              {uploadingId
                ? <span className={styles.spinner} />
                : idPreview
                  ? <img src={idPreview} alt="ID Card" className={styles.photoThumb} />
                  : <><span className={styles.photoIcon}>🪪</span><span className={styles.photoLabel}>ID CARD</span><span className={styles.photoHint}>Aadhaar / Passport</span></>}
              {idPreview && !uploadingId && <div className={styles.photoOverlay}>✓ Change</div>}
            </button>
            <input ref={idCardRef} type="file" accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0], "id")} />
          </div>
        </div>

        {/* ── 2. Basic Details ── */}
        <div className={`${styles.section} animate-fade-up delay-2`}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>2</span>
            <span className={styles.sectionTitle}>Basic Details</span>
          </div>
          <input type="text" className={styles.input} placeholder="Full Name"
            value={name} onChange={(e) => setName(e.target.value)} id="input-name" disabled={submitting} />

          {/* Primary phone */}
          <div className={styles.phoneRow}>
            <span className={styles.phonePrefix}>+91</span>
            <input type="tel" className={styles.input} placeholder="Mobile Number"
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              id="input-phone" maxLength={10} inputMode="numeric" disabled={submitting} />
          </div>

          {/* Alt phone — optional */}
          <div className={styles.phoneRow}>
            <span className={styles.phonePrefix}>+91</span>
            <input type="tel" className={styles.input} placeholder="Alt. Number (optional)"
              value={altPhone} onChange={(e) => setAltPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              id="input-alt-phone" maxLength={10} inputMode="numeric" disabled={submitting} />
          </div>

          {/* Emergency contact */}
          <p className={styles.fieldGroupLabel}>Emergency Contact</p>
          <div className={styles.phoneRow}>
            <span className={styles.phonePrefix}>+91</span>
            <input type="tel" className={styles.input} placeholder="Emergency Number"
              value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value.replace(/\D/g, "").slice(0, 10))}
              id="input-emergency" maxLength={10} inputMode="numeric" disabled={submitting} />
          </div>
          {/* Relation tags */}
          <div className={styles.relationRow}>
            {["Father", "Mother", "Sibling", "Friend", "Other"].map((rel) => (
              <button
                key={rel}
                type="button"
                className={`${styles.relTag} ${emergencyRelation === rel ? styles.relTagActive : ""}`}
                onClick={() => setEmergencyRelation(rel)}
                disabled={submitting}
              >{rel}</button>
            ))}
          </div>

          {/* Joining date */}
          <div className={styles.dateRow}>
            <label className={styles.dateLabel}>Joining Date</label>
            <input type="date" className={styles.input} value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)} id="input-date" disabled={submitting} />
          </div>
        </div>

        {/* ── 3. Money ── */}
        <div className={`${styles.section} animate-fade-up delay-3`}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>3</span>
            <span className={styles.sectionTitle}>Money Received</span>
          </div>

          {/* Monthly Rent */}
          <p className={styles.fieldGroupLabel}>Monthly Rent</p>
          <div className={styles.depositRow}>
            <span className={styles.rupeeSign}>₹</span>
            <input type="number" className={`${styles.input} ${styles.depositInput}`}
              placeholder="Monthly Rent Amount" value={monthlyRent}
              onChange={(e) => setMonthlyRent(e.target.value)}
              id="input-rent" inputMode="numeric" disabled={submitting} />
          </div>

          {/* Deposit */}
          <p className={styles.fieldGroupLabel} style={{ marginTop: 14 }}>Deposit (Advance)</p>
          <div className={styles.depositRow}>
            <span className={styles.rupeeSign}>₹</span>
            <input type="number" className={`${styles.input} ${styles.depositInput}`}
              placeholder="Deposit Amount" value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              id="input-deposit" inputMode="numeric" disabled={submitting} />
          </div>
          <p className={styles.paymentLabel}>Payment Mode</p>
          <div className={styles.paymentRow}>
            <button className={`${styles.payBtn} ${paymentMode === "cash" ? styles.payBtnActive : ""}`}
              onClick={() => setPaymentMode("cash")} id="btn-cash">
              <span className={styles.payIcon}>💵</span><span>CASH</span>
            </button>
            <button className={`${styles.payBtn} ${paymentMode === "upi" ? styles.payBtnActive : ""}`}
              onClick={() => setPaymentMode("upi")} id="btn-upi">
              <span className={styles.payIcon}>📱</span><span>UPI</span>
            </button>
          </div>
        </div>

        {error && <p className={`${styles.error} animate-fade-up`}>{error}</p>}

        <button className={`${styles.confirmBtn} animate-fade-up delay-3`}
          onClick={handleSubmit}
          disabled={submitting || uploadingPhoto || uploadingId}
          id="btn-confirm-checkin">
          {submitting
            ? <><span className={styles.spinnerDark} /> Checking In…</>
            : "🎉 CONFIRM CHECK-IN"}
        </button>

      </div>
    </main>
  );
}

/* ─── Page export — Suspense wraps CheckInForm for useSearchParams ─── */
export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CheckInForm />
    </Suspense>
  );
}
