"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const PG_TYPES = [
  { value: "gents", label: "Gents", emoji: "🚹", color: "#3b82f6" },
  { value: "ladies", label: "Ladies", emoji: "🚺", color: "#ec4899" },
  { value: "co-living", label: "Co-Living", emoji: "🧑‍🤝‍🧑", color: "#8b5cf6" },
];

const SHARING_OPTIONS = [1, 2, 3, 4, 5];

export default function PGDetailsPage() {
  const router = useRouter();

  const [pgName, setPgName] = useState("");
  const [pgType, setPgType] = useState("gents");
  const [totalFloors, setTotalFloors] = useState(1);
  const [address, setAddress] = useState("");
  const [locationLink, setLocationLink] = useState("");
  const [selectedSharings, setSelectedSharings] = useState<number[]>([1, 2]);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alreadySaved, setAlreadySaved] = useState(false);

  // Load saved PG data on mount
  useEffect(() => {
    const pgId = localStorage.getItem("pg_eg_pg_id");
    if (!pgId) { setLoading(false); return; }

    fetch(`${API_URL}/api/pgs/${pgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.pg) {
          const pg = data.pg;
          setPgName(pg.name);
          setPgType(pg.type);
          setTotalFloors(pg.totalFloors);
          setAddress(pg.address || "");
          setLocationLink(pg.locationLink || "");
          const standardSharings = pg.sharings.filter((s: number) => s <= 5);
          const custom = pg.sharings.find((s: number) => s > 5);
          setSelectedSharings(standardSharings);
          if (custom) { setCustomValue(String(custom)); setShowCustom(true); }
          setAlreadySaved(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleSharing(num: number) {
    setSelectedSharings((prev) =>
      prev.includes(num) ? prev.filter((s) => s !== num) : [...prev, num]
    );
  }

  function adjustFloors(delta: number) {
    setTotalFloors((prev) => Math.max(1, Math.min(50, prev + delta)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (pgName.trim().length < 2) { setError("Please enter your PG name"); return; }

    const allSharings = [...selectedSharings];
    const customNum = parseInt(customValue);
    if (showCustom && customNum > 0 && !allSharings.includes(customNum)) {
      allSharings.push(customNum);
    }
    if (allSharings.length === 0) { setError("Select at least one sharing type"); return; }

    const ownerId = localStorage.getItem("pg_eg_owner_id");
    if (!ownerId) { setError("Owner details missing. Please go back and fill Owner Details first."); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/pgs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId,
          name: pgName.trim(),
          type: pgType,
          totalFloors,
          address: address.trim(),
          locationLink: locationLink.trim() || null,
          sharings: allSharings,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      localStorage.setItem("pg_eg_pg_id", data.pg.id);
      localStorage.setItem("pg_eg_pg_name", data.pg.name);

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

        {/* Title */}
        <div className="animate-fade-up delay-1">
          <p className={styles.stepLabel}>STEP 02</p>
          <h2 className={styles.title}>PG Details</h2>
          <p className={styles.subtitle}>Tell us about your PG building.</p>
        </div>

        {alreadySaved && (
          <div className={`${styles.savedBanner} animate-fade-up`}>
            ✅ PG details saved. Update below if needed.
          </div>
        )}

        <form onSubmit={handleSubmit} className="animate-fade-up delay-2">

          {/* ── PG Name ── */}
          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor="pg-name">
              PG Name
            </label>
            <input
              id="pg-name"
              type="text"
              className={styles.input}
              placeholder='e.g. "Sri Venkatesh PG"'
              value={pgName}
              onChange={(e) => setPgName(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* ── PG Type ── */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>PG Type</p>
            <div className={styles.typeGrid}>
              {PG_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`${styles.typeCard} ${pgType === t.value ? styles.typeCardActive : ""}`}
                  style={pgType === t.value ? { "--type-color": t.color } as React.CSSProperties : {}}
                  onClick={() => setPgType(t.value)}
                  id={`type-${t.value}`}
                >
                  <span className={styles.typeEmoji}>{t.emoji}</span>
                  <span className={styles.typeLabel}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Total Floors ── */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Total Floors</p>
            <div className={styles.counterRow}>
              <button
                type="button"
                className={styles.counterBtn}
                onClick={() => adjustFloors(-1)}
                disabled={totalFloors <= 1}
                id="btn-floors-minus"
              >
                −
              </button>
              <div className={styles.counterDisplay}>
                <span className={styles.counterNumber}>{totalFloors}</span>
                <span className={styles.counterUnit}>
                  {totalFloors === 1 ? "Floor" : "Floors"}
                </span>
              </div>
              <button
                type="button"
                className={styles.counterBtn}
                onClick={() => adjustFloors(1)}
                disabled={totalFloors >= 50}
                id="btn-floors-plus"
              >
                +
              </button>
            </div>
          </div>

          {/* ── Address ── */}
          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor="pg-address">
              Address <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              id="pg-address"
              className={styles.textarea}
              placeholder="e.g. 12, MG Road, near City Bus Stop, Bengaluru"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              disabled={saving}
            />
            <input
              id="pg-location-link"
              type="url"
              className={`${styles.input} ${styles.locationInput}`}
              placeholder="📍 Google Maps link (optional)"
              value={locationLink}
              onChange={(e) => setLocationLink(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* ── Sharings ── */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Sharing Types Available</p>
            <div className={styles.chipsRow}>
              {SHARING_OPTIONS.map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`${styles.chip} ${selectedSharings.includes(num) ? styles.chipActive : ""}`}
                  onClick={() => toggleSharing(num)}
                  id={`sharing-${num}`}
                >
                  {selectedSharings.includes(num) ? "✅" : "○"} {num}-Share
                </button>
              ))}
              <button
                type="button"
                className={`${styles.chip} ${showCustom ? styles.chipActive : ""}`}
                onClick={() => setShowCustom(!showCustom)}
                id="sharing-custom"
              >
                {showCustom ? "✅" : "➕"} Custom
              </button>
            </div>

            {showCustom && (
              <div className={styles.customRow}>
                <input
                  type="number"
                  className={styles.customInput}
                  placeholder="e.g. 6"
                  min={6}
                  max={20}
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  id="sharing-custom-value"
                />
                <span className={styles.customLabel}>-Share</span>
              </div>
            )}
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {/* ── Submit ── */}
          <button
            type="submit"
            className={styles.primaryBtn}
            id="btn-save-pg"
            disabled={saving}
          >
            {saving ? (
              <span className={styles.btnLoading}>
                <span className={styles.spinner} /> Saving…
              </span>
            ) : alreadySaved ? (
              "Update PG Details →"
            ) : (
              "Save PG Details →"
            )}
          </button>

          {/* Next step navigation — only visible after saving */}
          {alreadySaved && (
            <button
              type="button"
              className={styles.nextBtn}
              id="btn-next-building"
              onClick={() => router.push("/add-pg/building")}
            >
              Next: Set Up Rooms →
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
