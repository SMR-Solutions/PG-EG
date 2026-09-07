"use client";
import AppLogo from "@/components/AppLogo";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const PG_TYPES = [
  { value: "gents",     label: "Gents",     emoji: "🚹", color: "#3b82f6" },
  { value: "ladies",    label: "Ladies",    emoji: "🚺", color: "#ec4899" },
  { value: "co-living", label: "Co-Living", emoji: "🧑‍🤝‍🧑", color: "#8b5cf6" },
];

const SHARING_OPTIONS = [1, 2, 3, 4, 5];

function PGDetailsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?new=true → always blank form, always POST a brand-new PG
  const isNew = searchParams.get("new") === "true";
  // ?pgId= → explicit PG to edit (set by building page's Prev button)
  const urlPgId = searchParams.get("pgId");

  const { isAuthenticated, isLoading: authLoading, owner, activePgId, token, refreshAuth, setActivePg } = useAuth();

  // ── Manager Details (per-PG) ─────────────
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");

  // ── PG Details ───────────────────────────
  const [pgName, setPgName]           = useState("");
  const [pgType, setPgType]           = useState("gents");
  const [totalFloors, setTotalFloors] = useState(1);
  const [address, setAddress]         = useState("");
  const [locationLink, setLocationLink] = useState("");
  const [selectedSharings, setSelectedSharings] = useState<number[]>([1, 2]);
  const [showCustom, setShowCustom]   = useState(false);
  const [customValue, setCustomValue] = useState("");

  const [saving, setSaving]           = useState(false);
  const [loading, setLoading]         = useState(!isNew);
  const [error, setError]             = useState("");
  const [alreadySaved, setAlreadySaved] = useState(false);

  // Guard — must be signed in
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/add-pg/pg-details");
    }
  }, [authLoading, isAuthenticated, router]);

  // Pre-fill manager details from account owner (user can change them)
  useEffect(() => {
    if (isNew && owner && !managerName) {
      // Pre-fill with account-level details as convenience defaults
      const accountName  = owner.name  || "";
      const accountPhone = owner.phone || "";
      // Don't pre-fill if it looks like a Google email (placeholder phone)
      const isGooglePlaceholder = accountPhone.includes("@");
      if (accountName)  setManagerName(accountName);
      if (!isGooglePlaceholder && accountPhone) setManagerPhone(accountPhone);
    }
  // only run once when owner loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  // Load existing PG data only when NOT creating a new PG
  useEffect(() => {
    if (isNew) { setLoading(false); return; }

    // urlPgId (from building's Prev button) takes priority over activePgId
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (managerName.trim().length < 2) { setError("Please enter the manager's name"); return; }
    if (managerPhone.trim().length < 6) { setError("Please enter a valid phone number"); return; }
    if (pgName.trim().length < 2)       { setError("Please enter your PG name"); return; }

    const allSharings = [...selectedSharings];
    const customNum = parseInt(customValue);
    if (showCustom && customNum > 0 && !allSharings.includes(customNum)) allSharings.push(customNum);
    if (allSharings.length === 0) { setError("Select at least one sharing type"); return; }

    const ownerId = owner?.id;
    if (!ownerId) { setError("Please sign in first."); return; }

    setSaving(true);
    try {
      // urlPgId = explicit PG (coming back from building); activePgId = currently selected PG
      // isNew=true → always POST a brand-new PG, never PATCH
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

      // If this was a new PG, switch active to it immediately
      if (isNew) {
        localStorage.setItem("pg_eg_active_pg_id", newPgId);
        setActivePg(newPgId);
      }

      await refreshAuth();
      router.push(`/add-pg/building?pgId=${newPgId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loadingScreen}><span className={styles.spinner} /></div>
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
          <Link href="/add-pg" className={styles.backBtn} id="btn-back">← Back</Link>
          <AppLogo />
        </div>

        {/* Step label */}
        <div className="animate-fade-up">
          <p className={styles.stepLabel}>STEP 02</p>
          <h2 className={styles.title}>{isNew ? "New PG Details" : "PG Details"}</h2>
          <p className={styles.subtitle}>
            {isNew ? "Set up your new property." : "Update your PG information."}
          </p>
        </div>

        {alreadySaved && !isNew && (
          <div className={`${styles.savedBanner} animate-fade-up`}>
            ✅ PG details saved. Update below if needed.
          </div>
        )}

        <form onSubmit={handleSubmit}>

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
              Google Maps Link <span className={styles.optional}>(optional)</span>
            </p>
            <input
              id="pg-location" type="url" className={`${styles.input} ${styles.locationInput}`}
              placeholder="https://maps.google.com/..."
              value={locationLink} onChange={(e) => setLocationLink(e.target.value)}
              disabled={saving}
            />
          </div>

          {error && (
            <div className={`${styles.error} animate-fade-up`} style={{ marginTop: 12 }}>
              {error}
            </div>
          )}

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
        </form>
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
