"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function OwnerDetailsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, owner, token, refreshAuth } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [alreadySaved, setAlreadySaved] = useState(false);

  // Redirect to sign-in if not logged in
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/sign-in?from=/add-pg/owner-details");
  }, [authLoading, isAuthenticated, router]);

  // Pre-fill from auth context
  useEffect(() => {
    if (owner) {
      setName(owner.name || "");
      // Phone stored as email for Google users — show blank if it looks like email
      const p = owner.phone || "";
      if (!p.includes("@")) setPhone(p.replace("+91", ""));
      setAlreadySaved(true);
    }
  }, [owner]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Please enter your full name");
      return;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }

    setSaving(true);
    try {
      const ownerId = owner?.id;
      if (!ownerId) throw new Error("Not signed in");

      // Update existing owner record
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

      await refreshAuth(); // Sync updated name back to context
      router.push("/add-pg");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.loadingScreen}>
          <span className={styles.spinner} />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>
        {/* Header */}
        <div className={`${styles.header} animate-fade-up`}>
          <Link href="/add-pg" className={styles.backBtn} id="btn-back">
            ← Back
          </Link>
          <div className={styles.logo}>
            <span className={styles.logoPG}>PG</span>
            <span className={styles.logoDash}>-</span>
            <span className={styles.logoEG}>EG</span>
          </div>
        </div>

        {/* Step label */}
        <div className="animate-fade-up delay-1">
          <p className={styles.stepLabel}>STEP 01</p>
          <h2 className={styles.title}>Owner Details</h2>
          <p className={styles.subtitle}>Tell us a bit about yourself.</p>
        </div>

        {/* Already saved banner */}
        {alreadySaved && (
          <div className={`${styles.savedBanner} animate-fade-up`}>
            ✅ Your details are saved. Update below if needed.
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className={`${styles.form} animate-fade-up delay-2`}
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor="owner-name">
              Your Full Name
            </label>
            <input
              id="owner-name"
              type="text"
              className={styles.input}
              placeholder="e.g. Rajesh Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              disabled={saving}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="owner-phone">
              Mobile Number
            </label>
            <div className={styles.phoneRow}>
              <div className={styles.countryCode}>🇮🇳 +91</div>
              <input
                id="owner-phone"
                type="tel"
                className={`${styles.input} ${styles.phoneInput}`}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                inputMode="numeric"
                disabled={saving}
              />
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

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
            ) : alreadySaved ? (
              "Update Owner Details →"
            ) : (
              "Save Owner Details →"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
