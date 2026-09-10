"use client";
import AppLogo from "@/components/AppLogo";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const PG_TYPES = [
  { value: "gents",     label: "Gents",     emoji: "🚹" },
  { value: "ladies",    label: "Ladies",    emoji: "🚺" },
  { value: "co-living", label: "Co-Living", emoji: "🧑‍🤝‍🧑" },
];
const SHARING_OPTIONS = [1, 2, 3, 4, 5];

function EditDetailsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pgId = searchParams.get("pgId");
  const { token, isLoading: authLoading, isAuthenticated } = useAuth();

  const [pgName, setPgName] = useState("");
  const [pgType, setPgType] = useState("gents");
  const [totalFloors, setTotalFloors] = useState(1);
  const [address, setAddress] = useState("");
  const [locationLink, setLocationLink] = useState("");
  const [selectedSharings, setSelectedSharings] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!pgId || authLoading) return; // wait for auth before fetching
    fetch(`${API_URL}/api/pgs/${pgId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.pg) {
          const pg = data.pg;
          setPgName(pg.name || "");
          setPgType(pg.type || "gents");
          setTotalFloors(pg.totalFloors || 1);
          setAddress(pg.address || "");
          setLocationLink(pg.locationLink || "");
          setSelectedSharings(pg.sharings || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pgId, token, authLoading]);

  function toggleSharing(num: number) {
    setSelectedSharings((prev) =>
      prev.includes(num) ? prev.filter((s) => s !== num) : [...prev, num]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!pgId) return;
    if (pgName.trim().length < 2) { setError("Please enter your PG name"); return; }
    if (selectedSharings.length === 0) { setError("Select at least one sharing type"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/pgs/${pgId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: pgName.trim(), type: pgType, totalFloors,
          address: address.trim(),
          locationLink: locationLink.trim() || null,
          sharings: selectedSharings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      setTimeout(() => router.back(), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <main className={styles.main}><div className={styles.centered}><span className={styles.spinner} /></div></main>
  );

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />
      <div className={styles.content}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
          <AppLogo />
        </div>

        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Edit PG Details 📋</h2>
          <p className={styles.subtitle}>Update your PG info below.</p>
        </div>

        <form onSubmit={handleSave} className={styles.form}>
          {/* PG Name */}
          <div className={styles.field}>
            <label className={styles.label}>PG Name</label>
            <input className={styles.input} value={pgName}
              onChange={(e) => setPgName(e.target.value)} placeholder="e.g. Sunshine PG" />
          </div>

          {/* Type */}
          <div className={styles.field}>
            <label className={styles.label}>PG Type</label>
            <div className={styles.typeRow}>
              {PG_TYPES.map((t) => (
                <button key={t.value} type="button"
                  className={`${styles.typeBtn} ${pgType === t.value ? styles.typeBtnActive : ""}`}
                  onClick={() => setPgType(t.value)}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Floors */}
          <div className={styles.field}>
            <label className={styles.label}>Total Floors</label>
            <div className={styles.stepper}>
              <button type="button" className={styles.stepBtn}
                onClick={() => setTotalFloors((p) => Math.max(1, p - 1))}>−</button>
              <span className={styles.stepValue}>{totalFloors}</span>
              <button type="button" className={styles.stepBtn}
                onClick={() => setTotalFloors((p) => Math.min(50, p + 1))}>+</button>
            </div>
          </div>

          {/* Sharing types */}
          <div className={styles.field}>
            <label className={styles.label}>Sharing Types</label>
            <div className={styles.sharingRow}>
              {SHARING_OPTIONS.map((n) => (
                <button key={n} type="button"
                  className={`${styles.sharingBtn} ${selectedSharings.includes(n) ? styles.sharingBtnActive : ""}`}
                  onClick={() => toggleSharing(n)}>
                  {n}-Share
                </button>
              ))}
            </div>
          </div>

          {/* Address */}
          <div className={styles.field}>
            <label className={styles.label}>Address</label>
            <input className={styles.input} value={address}
              onChange={(e) => setAddress(e.target.value)} placeholder="Full address" />
          </div>

          {/* Location link */}
          <div className={styles.field}>
            <label className={styles.label}>Google Maps Link <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} value={locationLink}
              onChange={(e) => setLocationLink(e.target.value)} placeholder="https://maps.google.com/..." />
          </div>

          {error && <p className={styles.error}>{error}</p>}
          {saved && <p className={styles.success}>✅ Saved! Going back…</p>}

          <button type="submit" className={styles.saveBtn} disabled={saving}>
            {saving ? "Saving…" : "Save Changes ✓"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function EditDetailsPage() {
  return <Suspense fallback={null}><EditDetailsInner /></Suspense>;
}
