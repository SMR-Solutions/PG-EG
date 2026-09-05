"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function OwnerDetailsPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alreadySaved, setAlreadySaved] = useState(false);

  // On mount: check localStorage → pre-fill saved owner data
  useEffect(() => {
    const ownerId = localStorage.getItem("pg_eg_owner_id");
    if (!ownerId) {
      setLoading(false);
      return;
    }
    // Fetch from backend and pre-fill
    fetch(`${API_URL}/api/owners/${ownerId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.owner) {
          setName(data.owner.name);
          // Phone stored as +91XXXXXXXXXX → show just the 10 digits
          setPhone(data.owner.phone.replace("+91", ""));
          setAlreadySaved(true);
        }
      })
      .catch(() => {/* no-op: just show empty form */})
      .finally(() => setLoading(false));
  }, []);

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
      const res = await fetch(`${API_URL}/api/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: `+91${digits}` }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      localStorage.setItem("pg_eg_owner_id", data.owner.id);
      localStorage.setItem("pg_eg_owner_name", data.owner.name);
      localStorage.setItem("pg_eg_owner_phone", data.owner.phone);

      router.push("/add-pg");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
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
