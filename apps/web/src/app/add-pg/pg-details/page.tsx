"use client";
import AppLogo from "@/components/AppLogo";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const PG_TYPES = [
  { value: "gents",     label: "Gents",     emoji: "🚹", color: "#3b82f6" },
  { value: "ladies",    label: "Ladies",    emoji: "🚺", color: "#ec4899" },
  { value: "co-living", label: "Co-Living", emoji: "🧑‍🤝‍🧑", color: "#8b5cf6" },
];

const SHARING_OPTIONS = [1, 2, 3, 4, 5];

// ─── Inline sign-in step ─────────────────────────────────────────────────────
type SignInStep = "idle" | "phone-form" | "otp";

function PGDetailsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "true";
  const urlPgId = searchParams.get("pgId");

  const { isAuthenticated, isLoading: authLoading, owner, activePgId, token, refreshAuth, setActivePg, signIn } = useAuth();

  // ── PG Form fields ────────────────────────────────────────────────
  const [managerName, setManagerName]     = useState("");
  const [managerPhone, setManagerPhone]   = useState("");
  const [pgName, setPgName]               = useState("");
  const [pgType, setPgType]               = useState("gents");
  const [totalFloors, setTotalFloors]     = useState(1);
  const [address, setAddress]             = useState("");
  const [locationLink, setLocationLink]   = useState("");
  const [selectedSharings, setSelectedSharings] = useState<number[]>([1, 2]);
  const [showCustom, setShowCustom]       = useState(false);
  const [customValue, setCustomValue]     = useState("");
  const [coordStatus, setCoordStatus]     = useState<"idle" | "found" | "failed">("idle");

  const [saving, setSaving]               = useState(false);
  const [loading, setLoading]             = useState(!isNew);
  const [error, setError]                 = useState("");
  const [alreadySaved, setAlreadySaved]   = useState(false);
  const [linkResolving, setLinkResolving] = useState(false);

  // ── Inline sign-in state (shown when isNew & not authenticated) ───
  const [signInStep, setSignInStep]       = useState<SignInStep>("idle");
  const [inlineName, setInlineName]       = useState("");
  const [inlinePhone, setInlinePhone]     = useState("");
  const [inlineOtp, setInlineOtp]         = useState(["", "", "", "", "", ""]);
  const [inlineSending, setInlineSending] = useState(false);
  const [inlineVerifying, setInlineVerifying] = useState(false);
  const [inlineGoogleLoading, setInlineGoogleLoading] = useState(false);
  const [inlineCountdown, setInlineCountdown] = useState(0);
  const [signInError, setSignInError]     = useState("");
  const [confirmation, setConfirmation]   = useState<ConfirmationResult | null>(null);
  const recaptchaRef                      = useRef<RecaptchaVerifier | null>(null);
  const otpRefs                           = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown for OTP resend
  useEffect(() => {
    if (inlineCountdown <= 0) return;
    const t = setTimeout(() => setInlineCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [inlineCountdown]);

  // ── Auth guard: only redirect for EDIT mode ───────────────────────
  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isNew) {
      router.replace("/sign-in?from=/add-pg/pg-details");
    }
  }, [authLoading, isAuthenticated, isNew, router]);

  // Pre-fill manager from authenticated owner
  useEffect(() => {
    if (isNew && owner && !managerName) {
      const accountName  = owner.name  || "";
      const accountPhone = owner.phone || "";
      const isGooglePlaceholder = accountPhone.includes("@");
      if (accountName)  setManagerName(accountName);
      if (!isGooglePlaceholder && accountPhone) setManagerPhone(accountPhone);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  // Load existing PG data for edit mode
  useEffect(() => {
    if (isNew) { setLoading(false); return; }
    const pgId = urlPgId || activePgId
      || localStorage.getItem("pg_eg_active_pg_id")
      || localStorage.getItem("pg_eg_pg_id");
    if (!pgId) { setLoading(false); return; }

    fetch(`${API_URL}/api/pgs/${pgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.pg) {
          const pg = data.pg;
          setManagerName(pg.managerName || "");
          setManagerPhone(pg.managerPhone || "");
          setPgName(pg.name);
          setPgType(pg.type);
          setTotalFloors(pg.totalFloors);
          setAddress(pg.address || "");
          setLocationLink(pg.locationLink || "");
          if (pg.latitude && pg.longitude) setCoordStatus("found");
          else if (pg.locationLink) setCoordStatus("failed");
          const standardSharings = pg.sharings.filter((s: number) => s <= 5);
          const custom = pg.sharings.find((s: number) => s > 5);
          setSelectedSharings(standardSharings.length ? standardSharings : [1, 2]);
          if (custom) { setCustomValue(String(custom)); setShowCustom(true); }
          setAlreadySaved(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isNew, urlPgId, activePgId]);

  function toggleSharing(num: number) {
    setSelectedSharings((prev) =>
      prev.includes(num) ? prev.filter((s) => s !== num) : [...prev, num]
    );
  }

  function adjustFloors(delta: number) {
    setTotalFloors((prev) => Math.max(1, Math.min(50, prev + delta)));
  }

  // Auto-resolve short Maps links on paste/type
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleLocationLinkChange(val: string) {
    setLocationLink(val);
    setCoordStatus("idle");
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    const trimmed = val.trim();
    if (!trimmed) return;
    // Debounce 800ms then resolve
    resolveTimerRef.current = setTimeout(async () => {
      setLinkResolving(true);
      try {
        const res = await fetch(`${API_URL}/api/public/resolve-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        if (res.ok) {
          setCoordStatus("found");
        } else {
          setCoordStatus("failed");
        }
      } catch {
        setCoordStatus("failed");
      } finally {
        setLinkResolving(false);
      }
    }, 800);
  }

  // ── Validate form fields before submit ───────────────────────────
  function validateForm(): string | null {
    if (managerName.trim().length < 2) return "Please enter the manager's name";
    if (managerPhone.trim().length < 6) return "Please enter a valid phone number";
    if (pgName.trim().length < 2)       return "Please enter your PG name";
    if (!locationLink.trim())           return "Google Maps link is required — students use it to find your PG";
    const allSharings = [...selectedSharings];
    const customNum = parseInt(customValue);
    if (showCustom && customNum > 0 && !allSharings.includes(customNum)) allSharings.push(customNum);
    if (allSharings.length === 0)       return "Select at least one sharing type";
    return null;
  }

  // ── Submit PG (called after auth is confirmed) ────────────────────
  async function submitPG(authToken: string, ownerId: string) {
    const allSharings = [...selectedSharings];
    const customNum = parseInt(customValue);
    if (showCustom && customNum > 0 && !allSharings.includes(customNum)) allSharings.push(customNum);

    setSaving(true);
    try {
      const existingPgId = isNew
        ? null
        : (urlPgId || activePgId || localStorage.getItem("pg_eg_active_pg_id") || localStorage.getItem("pg_eg_pg_id"));

      const method = existingPgId ? "PATCH" : "POST";
      const url = existingPgId
        ? `${API_URL}/api/pgs/${existingPgId}`
        : `${API_URL}/api/pgs`;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          ownerId,
          name: pgName.trim(),
          type: pgType,
          totalFloors,
          address: address.trim(),
          locationLink: locationLink.trim() || null,
          sharings: allSharings,
          managerName: managerName.trim(),
          managerPhone: managerPhone.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      const newPgId = data.pg.id;
      if (isNew) {
        localStorage.setItem("pg_eg_active_pg_id", newPgId);
        setActivePg(newPgId);
      }

      await refreshAuth();
      router.push(`/add-pg/building?pgId=${newPgId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  // ── For already-authenticated submit (edit mode) ──────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) { setError(validationError); return; }
    const ownerId = owner?.id;
    if (!ownerId || !token) { setError("Please sign in first."); return; }
    setError("");
    await submitPG(token, ownerId);
  }

  // ─── Google Sign-In (inline) ────────────────────────────────────
  async function handleInlineGoogle() {
    setError(""); setSignInError(""); setInlineGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, role: "owner" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Google sign-in failed");
      }
      const data = await res.json();

      // ❌ Existing "user" (student) account trying to add PG
      if (data.role === "user") {
        setSignInError(
          "This Google account is registered as a student account. " +
          "Please use a different Google account to add your PG."
        );
        return;
      }

      signIn(data.token, data.owner, data.hasPG, data.pgId, data.pgs, "owner");

      // ✓ Returning owner who already has a PG — skip form, go to dashboard
      if (data.hasPG) {
        if ((data.pgs || []).length > 1) {
          router.replace("/select-pg");
        } else {
          router.replace("/dashboard");
        }
        return;
      }

      // New owner — validate form first, then submit
      const validationError = validateForm();
      if (validationError) { setError(validationError); return; }
      await submitPG(data.token, data.owner.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("popup-closed-by-user") && !msg.includes("cancelled-popup-request")) {
        setSignInError(msg || "Google sign-in failed. Please try again.");
      }
    } finally {
      setInlineGoogleLoading(false);
    }
  }

  // ─── Phone OTP — Setup Recaptcha ────────────────────────────────
  function setupRecaptcha() {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container-pg", {
        size: "invisible",
        callback: () => {},
      });
    }
    return recaptchaRef.current;
  }

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) { setError(validationError); return; }
    if (inlineName.trim().length < 2) { setSignInError("Please enter your name"); return; }
    if (inlinePhone.length !== 10) { setSignInError("Enter a valid 10-digit mobile number"); return; }
    setSignInError(""); setInlineSending(true);
    try {
      const appVerifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, `+91${inlinePhone}`, appVerifier);
      setConfirmation(result);
      setSignInStep("otp");
      setInlineCountdown(30);
    } catch (err: unknown) {
      recaptchaRef.current = null;
      setSignInError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setInlineSending(false);
    }
  }

  async function handleVerifyOTP() {
    const code = inlineOtp.join("");
    if (code.length !== 6 || !confirmation) return;
    setSignInError(""); setInlineVerifying(true);
    try {
      const userCredential = await confirmation.confirm(code);
      const idToken = await userCredential.user.getIdToken();

      const res = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, name: inlineName.trim(), role: "owner" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Verification failed");
      }
      const data = await res.json();

      // ❌ Existing "user" (student) account trying to add PG
      if (data.role === "user") {
        setSignInError(
          "This phone number is registered as a student account. " +
          "Please use a different number to add your PG."
        );
        setInlineOtp(["", "", "", "", "", ""]);
        return;
      }

      signIn(data.token, data.owner, data.hasPG, data.pgId, data.pgs, "owner");

      // ✓ Returning owner who already has a PG — skip form, go to dashboard
      if (data.hasPG) {
        if ((data.pgs || []).length > 1) {
          router.replace("/select-pg");
        } else {
          router.replace("/dashboard");
        }
        return;
      }

      // New owner — validate form first, then submit
      const newOwnerValidation = validateForm();
      if (newOwnerValidation) { setError(newOwnerValidation); return; }
      await submitPG(data.token, data.owner.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("invalid-verification-code")) setSignInError("Wrong OTP. Please check and try again.");
      else if (msg.includes("code-expired")) setSignInError("OTP expired. Please request a new one.");
      else setSignInError(msg || "Verification failed.");
      setInlineOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setInlineVerifying(false);
    }
  }

  function handleOtpInput(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...inlineOtp];
    next[index] = digit;
    setInlineOtp(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !inlineOtp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  // Show spinner only in edit-mode loading
  if ((authLoading && !isNew) || loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loadingScreen}><span className={styles.spinner} /></div>
      </main>
    );
  }

  // For edit mode (already authenticated required)
  if (!isNew && !isAuthenticated) return null;

  const showInlineSignIn = isNew && !isAuthenticated;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>
        {/* Header */}
        <div className={`${styles.header} animate-fade-up`}>
          <Link href="/" className={styles.backBtn} id="btn-back">← Back</Link>
          <AppLogo />
        </div>

        {/* Step label */}
        <div className="animate-fade-up">
          <p className={styles.stepLabel}>STEP 02</p>
          <h2 className={styles.title}>{isNew ? "PG Details" : "PG Details"}</h2>
          <p className={styles.subtitle}>
            {isNew ? "Fill in your PG info, then sign in to save." : "Update your PG information."}
          </p>
        </div>

        {alreadySaved && !isNew && (
          <div className={`${styles.savedBanner} animate-fade-up`}>
            ✅ PG details saved. Update below if needed.
          </div>
        )}

        <form onSubmit={isAuthenticated ? handleSubmit : (e) => e.preventDefault()}>

          {/* ── Manager Details ───────────────── */}
          <div className={`${styles.section} animate-fade-up delay-1`}>
            <p className={styles.sectionLabel}>PG Manager / Owner</p>
            <p className={styles.subtitle} style={{ fontSize: 12, marginTop: -6 }}>
              Who manages this property? (Can be different per PG)
            </p>
            <input
              id="manager-name" type="text" className={styles.input}
              placeholder="Manager's full name"
              value={managerName} onChange={(e) => setManagerName(e.target.value)}
              autoComplete="name" disabled={saving}
            />
            <input
              id="manager-phone" type="tel" className={styles.input}
              placeholder="Manager's phone number"
              value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)}
              autoComplete="tel" disabled={saving}
              style={{ marginTop: 10 }}
            />
          </div>

          {/* ── PG Name ──────────────────────── */}
          <div className={`${styles.section} animate-fade-up delay-1`} style={{ marginTop: 16 }}>
            <p className={styles.sectionLabel}>PG Name</p>
            <input
              id="pg-name" type="text" className={styles.input}
              placeholder='e.g. "Sunshine PG", "Green Valley Boys PG"'
              value={pgName} onChange={(e) => setPgName(e.target.value)}
              autoComplete="off" disabled={saving}
            />
          </div>

          {/* ── PG Type ──────────────────────── */}
          <div className={`${styles.section} animate-fade-up delay-1`} style={{ marginTop: 16 }}>
            <p className={styles.sectionLabel}>PG Type</p>
            <div className={styles.typeGrid}>
              {PG_TYPES.map((t) => (
                <button
                  key={t.value} type="button"
                  className={`${styles.typeCard} ${pgType === t.value ? styles.typeCardActive : ""}`}
                  style={pgType === t.value ? { "--type-color": t.color } as React.CSSProperties : {}}
                  onClick={() => setPgType(t.value)} id={`type-${t.value}`}
                >
                  <span className={styles.typeEmoji}>{t.emoji}</span>
                  <span className={styles.typeLabel}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Total Floors ─────────────────── */}
          <div className={`${styles.section} animate-fade-up delay-1`} style={{ marginTop: 16 }}>
            <p className={styles.sectionLabel}>Total Floors</p>
            <div className={styles.counterRow}>
              <button type="button" className={styles.counterBtn}
                onClick={() => adjustFloors(-1)} disabled={totalFloors <= 1}>−</button>
              <div className={styles.counterDisplay}>
                <span className={styles.counterNumber}>{totalFloors}</span>
                <span className={styles.counterUnit}>Floor{totalFloors > 1 ? "s" : ""}</span>
              </div>
              <button type="button" className={styles.counterBtn}
                onClick={() => adjustFloors(1)} disabled={totalFloors >= 50}>+</button>
            </div>
          </div>

          {/* ── Sharing Types ─────────────────── */}
          <div className={`${styles.section} animate-fade-up delay-2`} style={{ marginTop: 16 }}>
            <p className={styles.sectionLabel}>Sharing Types</p>
            <p className={styles.subtitle} style={{ fontSize: 13, marginTop: -4 }}>
              Which room configurations does your PG offer?
            </p>
            <div className={styles.chipsRow}>
              {SHARING_OPTIONS.map((n) => (
                <button key={n} type="button"
                  className={`${styles.chip} ${selectedSharings.includes(n) ? styles.chipActive : ""}`}
                  onClick={() => toggleSharing(n)} id={`sharing-${n}`}>
                  {n}-Share
                </button>
              ))}
              <button type="button"
                className={`${styles.chip} ${showCustom ? styles.chipActive : ""}`}
                onClick={() => setShowCustom((p) => !p)} id="sharing-custom">
                + Custom
              </button>
            </div>
            {showCustom && (
              <div className={styles.customRow}>
                <input
                  type="number" min={6} max={20} className={styles.customInput}
                  placeholder="e.g. 6"
                  value={customValue} onChange={(e) => setCustomValue(e.target.value)}
                />
                <span className={styles.customLabel}>beds per room</span>
              </div>
            )}
          </div>

          {/* ── Address ──────────────────────── */}
          <div className={`${styles.section} animate-fade-up delay-2`} style={{ marginTop: 16 }}>
            <p className={styles.sectionLabel}>Full Address</p>
            <textarea
              id="pg-address" className={styles.textarea}
              placeholder="Building No., Street, Area, City — PIN"
              value={address} onChange={(e) => setAddress(e.target.value)}
              rows={2} disabled={saving}
            />
          </div>

          {/* ── Google Maps Link ──────────────── */}
          <div className={`${styles.section} animate-fade-up delay-2`} style={{ marginTop: 16 }}>
            <p className={styles.sectionLabel}>
              Google Maps Link <span style={{ color: "var(--brand-red)", fontSize: 11 }}>* Required</span>
            </p>
            <p className={styles.subtitle} style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
              Students find your PG using this link. Open Google Maps → tap Share → Copy Link.
            </p>
            <input
              id="pg-location" type="url" className={`${styles.input} ${styles.locationInput}`}
              placeholder="https://maps.app.goo.gl/... or full URL"
              value={locationLink}
              onChange={(e) => handleLocationLinkChange(e.target.value)}
              disabled={saving}
            />
            {locationLink.trim() && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12 }}>
                {linkResolving && (
                  <><span className={styles.spinner} style={{ width: 12, height: 12 }} />
                  <span style={{ color: "var(--text-muted)" }}>Verifying link…</span></>
                )}
                {!linkResolving && coordStatus === "found" && (
                  <span style={{ color: "var(--brand-green)" }}>
                    ✅ Location found — your PG will appear in searches!
                  </span>
                )}
                {!linkResolving && coordStatus === "failed" && (
                  <span style={{ color: "var(--partial)" }}>
                    ⚠️ Short link not resolved. Try the full URL from your browser address bar.
                    <br />
                    <span style={{ opacity: 0.7 }}>Tip: On mobile, open Maps in Chrome → Menu → Desktop site → copy URL</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Form-level error ─────────────── */}
          {error && (
            <div className={`${styles.error} animate-fade-up`} style={{ marginTop: 12 }}>
              {error}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              AUTHENTICATED: normal save button
              NOT AUTHENTICATED (new PG): inline sign-in
          ════════════════════════════════════════════════════════════ */}
          {isAuthenticated ? (
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={saving}
              id="btn-save-pg"
              style={{ marginTop: 20 }}
            >
              {saving
                ? <span className={styles.btnLoading}><span className={styles.spinner} /> Saving…</span>
                : isNew ? "Save & Set Up Rooms →" : "Save & Continue →"}
            </button>
          ) : (
            /* ── Inline Sign-In (new PG flow) ── */
            <div className={styles.signInBox} id="inline-signin">
              <div className={styles.signInDivider}>
                <span>Sign in to save your PG</span>
              </div>

              {/* Google Button */}
              <button
                type="button"
                className={styles.googleBtn}
                onClick={handleInlineGoogle}
                disabled={inlineGoogleLoading || saving}
                id="btn-google-signin"
              >
                {inlineGoogleLoading ? (
                  <><span className={styles.spinner} /> Signing in…</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              {/* OR divider */}
              <div className={styles.orDivider}><span>OR</span></div>

              {/* Phone OTP */}
              {signInStep === "idle" && (
                <button
                  type="button"
                  className={styles.phoneToggleBtn}
                  onClick={() => setSignInStep("phone-form")}
                  id="btn-show-phone"
                >
                  📱 Sign in with Phone OTP
                </button>
              )}

              {signInStep === "phone-form" && (
                <form onSubmit={handleSendOTP} className={styles.phoneForm}>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Your Name (e.g. Rajesh Kumar)"
                    value={inlineName}
                    onChange={(e) => setInlineName(e.target.value)}
                    autoComplete="name"
                    id="input-inline-name"
                  />
                  <div className={styles.phoneRow} style={{ marginTop: 10 }}>
                    <div className={styles.countryCode}>🇮🇳 +91</div>
                    <input
                      type="tel" inputMode="numeric" maxLength={10}
                      className={`${styles.input} ${styles.phoneInput}`}
                      placeholder="98765 43210"
                      value={inlinePhone}
                      onChange={(e) => setInlinePhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      autoComplete="tel"
                      id="input-inline-phone"
                    />
                  </div>
                  {signInError && <p className={styles.signInError}>{signInError}</p>}
                  <button
                    type="submit"
                    className={styles.primaryBtn}
                    disabled={inlineSending}
                    style={{ marginTop: 12 }}
                    id="btn-send-otp"
                  >
                    {inlineSending ? <><span className={styles.spinner} /> Sending…</> : "Send OTP →"}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelPhoneBtn}
                    onClick={() => { setSignInStep("idle"); setSignInError(""); }}
                  >
                    ← Use Google instead
                  </button>
                </form>
              )}

              {signInStep === "otp" && (
                <div className={styles.phoneForm}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", marginBottom: 12 }}>
                    OTP sent to +91 {inlinePhone}
                  </p>
                  <div className={styles.otpRow}>
                    {inlineOtp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        type="tel" inputMode="numeric" maxLength={1}
                        className={styles.otpBox}
                        value={digit}
                        onChange={(e) => handleOtpInput(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        id={`otp-box-${i}`}
                      />
                    ))}
                  </div>
                  {signInError && <p className={styles.signInError}>{signInError}</p>}
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={handleVerifyOTP}
                    disabled={inlineVerifying || inlineOtp.join("").length < 6}
                    style={{ marginTop: 12 }}
                    id="btn-verify-otp"
                  >
                    {inlineVerifying ? <><span className={styles.spinner} /> Verifying…</> : "Verify & Create PG →"}
                  </button>
                  {inlineCountdown > 0 ? (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
                      Resend in {inlineCountdown}s
                    </p>
                  ) : (
                    <button
                      type="button"
                      className={styles.cancelPhoneBtn}
                      onClick={() => { setSignInStep("phone-form"); setInlineOtp(["","","","","",""]); setSignInError(""); recaptchaRef.current = null; setConfirmation(null); }}
                    >
                      ← Resend OTP
                    </button>
                  )}
                </div>
              )}

              {signInError && signInStep === "idle" && (
                <p className={styles.signInError}>{signInError}</p>
              )}
            </div>
          )}
        </form>

        {/* Invisible recaptcha container */}
        <div id="recaptcha-container-pg" />
      </div>
    </main>
  );
}

export default function PGDetailsPage() {
  return (
    <Suspense fallback={null}>
      <PGDetailsInner />
    </Suspense>
  );
}
