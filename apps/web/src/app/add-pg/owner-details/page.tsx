"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function OwnerDetailsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "true";
  const { isAuthenticated, isLoading: authLoading, owner, token, refreshAuth } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Redirect to sign-in if not logged in
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace(`/sign-in?from=/add-pg/owner-details${isNew ? "?new=true" : ""}`);
    }
  }, [authLoading, isAuthenticated, router]);

  // Pre-fill name from auth (Google gives display name)
  // Pre-fill phone only if it's a real phone (not the email placeholder)
  useEffect(() => {
    if (owner) {
      setName(owner.name || "");
      const p = owner.phone || "";
      if (!p.includes("@")) {
        // Real phone — strip +91 prefix for the input
        setPhone(p.replace("+91", ""));
      }
      // If phone is an email (Google user), leave phone blank so they must fill it
    }
  }, [owner]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) { setError("Please enter your full name"); return; }
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) { setError("Please enter a valid 10-digit mobile number"); return; }

    const ownerId = owner?.id;
    if (!ownerId) { setError("Not signed in"); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/owners/${ownerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: name.trim(), phone: `+91${digits}` }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      setSaved(true);
      await refreshAuth();
      setTimeout(() => router.push(isNew ? "/add-pg?new=true" : "/add-pg"), 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.loadingScreen}><span className={styles.spinner} /></div>
      </main>
    );
  }

  const isGoogleUser = owner?.phone?.includes("@");

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>
        {/* Header */}
        <div className={`${styles.header} animate-fade-up`}>
          <Link href={isNew ? "/add-pg?new=true" : "/add-pg"} className={styles.backBtn} id="btn-back">
            ← Back
          </Link>
          <div className={styles.logo}>
            <span className={styles.logoPG}>PG</span>
            <span className={styles.logoDash}>-</span>
            <span className={styles.logoEG}>EG</span>
          </div>
        </div>

        <div className={`${styles.formCard} animate-fade-up delay-1`}>
          {/* Title */}
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>Owner Details 👤</h2>
            <p className={styles.subtitle}>
              {isGoogleUser
                ? "You signed in with Google. Please confirm your name and add your phone number."
                : "Update your name or mobile number below."}
            </p>
          </div>

          {/* Google indicator */}
          {isGoogleUser && (
            <div className={styles.googleBadge}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Signed in as <strong>{owner?.email || owner?.phone}</strong>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Name */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="input-name">Your Full Name</label>
              <input
                id="input-name" type="text" className={styles.input}
                placeholder="e.g. Rajesh Kumar"
                value={name} onChange={(e) => setName(e.target.value)}
                autoComplete="name" disabled={saving}
              />
            </div>

            {/* Phone */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="input-phone">
                Mobile Number {isGoogleUser && <span className={styles.required}>*required</span>}
              </label>
              <div className={styles.phoneRow}>
                <div className={styles.countryCode}>🇮🇳 +91</div>
                <input
                  id="input-phone" type="tel" inputMode="numeric"
                  className={`${styles.input} ${styles.phoneInput}`}
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  autoComplete="tel" disabled={saving}
                />
              </div>
              {isGoogleUser && (
                <p className={styles.phoneHint}>
                  📱 This is needed so tenants and you can be contacted easily.
                </p>
              )}
            </div>

            {error && <p className={styles.error}>{error}</p>}
            {saved && <p className={styles.success}>✅ Saved! Continuing…</p>}

            <button
              type="submit"
              className={styles.primaryBtn}
              id="btn-save-owner"
              disabled={saving}
            >
              {saving ? (
                <span className={styles.btnLoading}>
                  <span className={styles.spinner} /> Saving…
                </span>
              ) : "Save & Continue →"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function OwnerDetailsPage() {
  return (
    <Suspense fallback={null}>
      <OwnerDetailsInner />
    </Suspense>
  );
}
