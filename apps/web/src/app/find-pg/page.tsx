"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./page.module.css";
import AppLogo from "@/components/AppLogo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ─── Fallback hardcoded list (used only if GPS denied / Overpass fails) ───
const FALLBACK_PLACES: Place[] = [
  { name: "JSS Academy of Technical Education", short: "JSS College", lat: 12.9021, lng: 77.5047 },
  { name: "RV College of Engineering", short: "RVCE", lat: 12.9237, lng: 77.4988 },
  { name: "BMS College of Engineering", short: "BMSCE", lat: 12.9440, lng: 77.5640 },
  { name: "Dayananda Sagar College", short: "DSC", lat: 12.9170, lng: 77.5468 },
  { name: "Christ University", short: "Christ University", lat: 12.9362, lng: 77.6102 },
  { name: "Bangalore University", short: "BU", lat: 12.9555, lng: 77.5718 },
  { name: "PES University", short: "PES University", lat: 12.9344, lng: 77.5345 },
  { name: "Manyata Tech Park", short: "Manyata Tech Park", lat: 13.0456, lng: 77.6213 },
  { name: "Electronic City Phase 1", short: "Electronic City", lat: 12.8399, lng: 77.6770 },
];

type Place = { name: string; short: string; lat: number; lng: number; icon?: string; };

interface PGResult {
  id: string;
  name: string;
  type: string;
  address: string;
  locationLink: string | null;
  sharings: number[];
  distanceKm: number;
  managerPhone: string | null;
  latitude: number | null;
  longitude: number | null;
}

type Step = "search" | "results";
type LocationMethod = "gps" | "link" | "preset";

function typeLabel(type: string) {
  if (type === "gents") return "🚹 Gents";
  if (type === "ladies") return "🚺 Ladies";
  return "🧑‍🤝‍🧑 Co-Living";
}

function distanceLabel(km: number) {
  if (km < 0.1) return "< 100m away";
  if (km < 1) return `${Math.round(km * 1000)}m away`;
  return `${km.toFixed(1)} km away`;
}

function walkOrRide(km: number) {
  if (km <= 0.5) return "🚶 Walking distance";
  if (km <= 2) return "🚲 Quick bike ride";
  if (km <= 5) return "🛺 Short auto ride";
  return "🚗 By vehicle";
}

// Build Google Maps directions URL: origin (user) → destination (PG)
function getDirectionsUrl(
  pg: PGResult,
  userCoords: { lat: number; lng: number } | null
): string {
  // Prefer DB coordinates for destination (reliable, won't be a wrong pasted link)
  if (pg.latitude && pg.longitude) {
    const dest = `${pg.latitude},${pg.longitude}`;
    const origin = userCoords ? `&origin=${userCoords.lat},${userCoords.lng}` : "";
    return `https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}&travelmode=driving`;
  }
  // Fallback: open the stored link if no coordinates
  return pg.locationLink || "#";
}

export default function FindPGPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, owner, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [step, setStep] = useState<Step>("search");
  const [method, setMethod] = useState<LocationMethod>("gps");
  const [locationLink, setLocationLink] = useState("");
  const [presetQuery, setPresetQuery] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<Place | null>(null);
  const [results, setResults] = useState<PGResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchedFrom, setSearchedFrom] = useState("");

  // Nearby places (dynamic via server proxy)
  const [nearbyPlaces, setNearbyPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [usingDetected, setUsingDetected] = useState(false);
  const [gpsNeeded, setGpsNeeded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  // Geocode confirmation step
  const [geocodeResult, setGeocodeResult] = useState<{
    name: string; lat: number; lng: number; distanceKm: number | null;
  } | null>(null);
  // Search radius state
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedRadius, setExpandedRadius] = useState(false);

  // Auth guard — redirect to sign-in if not logged in
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/find-pg&role=user");
    }
  }, [isLoading, isAuthenticated, router]);

  // Swipe-to-close sidebar
  let touchStartX = 0;
  function onSidebarTouchStart(e: React.TouchEvent) { touchStartX = e.touches[0].clientX; }
  function onSidebarTouchEnd(e: React.TouchEvent) {
    if (e.changedTouches[0].clientX - touchStartX > 60) setProfileOpen(false);
  }

  // ─── Detect nearby landmarks — calls our server which proxies Overpass ───
  async function fetchNearbyLandmarks(lat: number, lng: number) {
    setPlacesLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/public/nearby-places?lat=${lat}&lng=${lng}`
      );
      const data = await res.json();

      if (res.ok && data.places?.length > 0) {
        setNearbyPlaces(data.places);
        setUsingDetected(true);
      } else {
        // No results from OSM — use hardcoded fallback
        setNearbyPlaces(FALLBACK_PLACES);
        setUsingDetected(false);
      }
    } catch {
      setNearbyPlaces(FALLBACK_PLACES);
      setUsingDetected(false);
    } finally {
      setPlacesLoading(false);
    }
  }

  // When preset tab is activated, ask GPS (with proper prompt this time)
  function handlePresetTabClick() {
    setMethod("preset");
    setError("");
    setSelectedPreset(null);
    setGpsNeeded(false);
    setPresetQuery("");
    // If we already have coords, re-fetch
    if (userCoords) {
      fetchNearbyLandmarks(userCoords.lat, userCoords.lng);
      return;
    }
    if (!navigator.geolocation) {
      setNearbyPlaces(FALLBACK_PLACES);
      setUsingDetected(false);
      return;
    }
    setPlacesLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserCoords({ lat: latitude, lng: longitude });
        fetchNearbyLandmarks(latitude, longitude);
      },
      () => {
        // GPS denied — show prompt instead of silently falling back
        setGpsNeeded(true);
        setPlacesLoading(false);
      },
      { timeout: 8000, maximumAge: 120000, enableHighAccuracy: false }
    );
  }

  // ─── Geocode a typed place name: shows confirmation before PG search ────
  async function geocodeAndSearch(placeName: string) {
    if (!placeName.trim()) return;
    setGeocoding(true);
    setError("");
    setGeocodeResult(null);
    try {
      const coordsParams = userCoords
        ? `&lat=${userCoords.lat}&lng=${userCoords.lng}`
        : "";
      // Try exact → +Bangalore → +Bengaluru
      const attempts = [
        placeName.trim(),
        `${placeName.trim()} Bangalore`,
        `${placeName.trim()} Bengaluru`,
      ];
      let found: { name: string; lat: number; lng: number } | null = null;
      for (const q of attempts) {
        const res = await fetch(
          `${API_URL}/api/public/geocode?q=${encodeURIComponent(q)}${coordsParams}`
        );
        if (res.ok) { found = await res.json(); break; }
      }
      if (!found) {
        // Geocoding failed — set a special error that shows Maps Link button
        setError(`__notfound__:${placeName}`);
        return;
      }
      // Calculate distance from user (if we have coords)
      let distKm: number | null = null;
      if (userCoords) {
        const R = 6371;
        const dLat = (found.lat - userCoords.lat) * Math.PI / 180;
        const dLng = (found.lng - userCoords.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 +
          Math.cos(userCoords.lat * Math.PI / 180) *
          Math.cos(found.lat * Math.PI / 180) *
          Math.sin(dLng/2)**2;
        distKm = Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
      }
      // Don't search yet — show confirmation card
      setGeocodeResult({ name: found.name, lat: found.lat, lng: found.lng, distanceKm: distKm });
    } catch {
      setError(`__notfound__:${placeName}`);
    } finally {
      setGeocoding(false);
    }
  }

  // User confirmed the geocode result — now actually search
  async function confirmGeocodeSearch() {
    if (!geocodeResult) return;
    setGeocodeResult(null);
    await fetchNearby(geocodeResult.lat, geocodeResult.lng, geocodeResult.name);
  }

  // ─── Fetch nearby PGs given lat/lng ──────────────────────────────────
  // First search 5km. If 0 results, auto-expand to 10km.
  async function fetchNearby(lat: number, lng: number, fromLabel: string, radius = 5) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/public/pgs/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      const found: PGResult[] = data.results || [];
      // Auto-expand: if nothing in 5km, try 10km silently
      if (found.length === 0 && radius === 5) {
        const res2 = await fetch(`${API_URL}/api/public/pgs/nearby?lat=${lat}&lng=${lng}&radius=10`);
        const data2 = await res2.json();
        setResults(data2.results || []);
        setSearchCoords({ lat, lng });
        setSearchedFrom(fromLabel);
        setExpandedRadius(true); // already at 10km
      } else {
        setResults(found);
        setSearchCoords({ lat, lng });
        setSearchedFrom(fromLabel);
        setExpandedRadius(radius >= 10);
      }
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Load more — expand radius from 5km to 10km
  async function handleExpandRadius() {
    if (!searchCoords) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/public/pgs/nearby?lat=${searchCoords.lat}&lng=${searchCoords.lng}&radius=10`
      );
      const data = await res.json();
      setResults(data.results || []);
      setExpandedRadius(true);
    } catch { /* keep existing results */ }
    finally { setLoading(false); }
  }

  // ─── Method 1: Browser GPS ───────────────────────────────────────────
  async function handleUseGPS() {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location access.");
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetchNearby(latitude, longitude, "Your Current Location");
      },
      (err) => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location access denied. Please allow location or use another method.");
        } else {
          setError("Could not get your location. Please try another method.");
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // ─── Method 2: Paste Maps Link ───────────────────────────────────────
  async function handleResolveLink() {
    if (!locationLink.trim()) { setError("Please paste a Google Maps link."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/public/resolve-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: locationLink.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not resolve link");
      await fetchNearby(data.lat, data.lng, "Pasted Location");
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Could not resolve this link. Try pasting the full URL from your browser.");
    }
  }

  // ─── Method 3: Preset College/Place ──────────────────────────────────
  async function handlePresetSearch() {
    if (!selectedPreset) { setError("Please select a college or place."); return; }
    await fetchNearby(selectedPreset.lat, selectedPreset.lng, selectedPreset.name);
  }

  // Show nothing while checking auth (avoids content flash before redirect)
  if (isLoading || !isAuthenticated) return null;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      {/* ─── Logo Bar — like dashboard (no crown) ─── */}
      <div className={styles.logoBar}>
        <AppLogo size="sm" />
        {/* Profile avatar — no crown for users */}
        <button
          className={styles.topProfileBtn}
          onClick={() => setProfileOpen(true)}
          id="btn-open-profile"
          title={owner?.name || "Profile"}
        >
          {owner?.photoUrl
            ? <img src={owner.photoUrl} alt="Profile" className={styles.topProfileImg} />
            : (owner?.name || "U")[0].toUpperCase()}
        </button>
      </div>

      {/* ─── Profile Sidebar ─── */}
      {profileOpen && (
        <div className={styles.sidebarBackdrop} onClick={() => setProfileOpen(false)}>
          <div
            className={styles.profileSidebar}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onSidebarTouchStart}
            onTouchEnd={onSidebarTouchEnd}
          >
            {/* Close pill */}
            <button
              className={styles.sidebarPillTab}
              onClick={() => setProfileOpen(false)}
              id="btn-sidebar-close"
              aria-label="Close sidebar"
            >
              <span className={styles.sidebarPillArrow}>→</span>
            </button>

            {/* Theme toggle */}
            <div className={styles.themePill}>
              <button
                className={`${styles.themePillHalf} ${styles.themePillDark} ${theme === "dark" ? styles.themePillActive : ""}`}
                onClick={() => setTheme("dark")}
                aria-label="Dark mode"
                id="btn-theme-dark"
              >🌙</button>
              <button
                className={`${styles.themePillHalf} ${styles.themePillLight} ${theme === "light" ? styles.themePillActive : ""}`}
                onClick={() => setTheme("light")}
                aria-label="Light mode"
                id="btn-theme-light"
              >☀️</button>
            </div>

            <div className={styles.sidebarBody}>
              {/* User info */}
              <div className={styles.sidebarOwner}>
                <div className={styles.sidebarAvatar}>
                  {owner?.photoUrl
                    ? <img src={owner.photoUrl} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                    : (owner?.name || "U")[0].toUpperCase()}
                </div>
                <div>
                  <div className={styles.sidebarOwnerName}>{owner?.name || "User"}</div>
                  {owner?.phone && !owner.phone.includes("@") && (
                    <div className={styles.sidebarOwnerPhone}>{owner.phone}</div>
                  )}
                  {owner?.email && (
                    <div className={styles.sidebarOwnerEmail}>{owner.email}</div>
                  )}
                </div>
              </div>

              <div className={styles.sidebarDivider} />

              {/* Sign Out */}
              <button
                className={`${styles.sidebarAction} ${styles.sidebarActionDanger}`}
                id="btn-sign-out"
                onClick={() => { signOut(); router.replace("/"); }}
              >
                <div className={styles.sidebarActionIcon}>🚪</div>
                <div>
                  <div className={styles.sidebarActionTitle}>Sign Out</div>
                  <div className={styles.sidebarActionDesc}>Log out of your account</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "search" ? (
        <div className={`${styles.content} animate-fade-up`}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>Find a PG 🔍</h1>
            <p className={styles.subtitle}>Discover PGs near your college or workplace</p>
          </div>

          {/* Method Tabs */}
          <div className={styles.methodTabs}>
            <button
              className={`${styles.methodTab} ${method === "gps" ? styles.methodTabActive : ""}`}
              onClick={() => { setMethod("gps"); setError(""); }}
              id="tab-gps"
            >
              📍 My Location
            </button>
            <button
              className={`${styles.methodTab} ${method === "preset" ? styles.methodTabActive : ""}`}
              onClick={handlePresetTabClick}
              id="tab-preset"
            >
              🏛️ College / Work Places
            </button>
          </div>

          {/* GPS Method */}
          {method === "gps" && (
            <div className={`${styles.methodPanel} animate-fade-up`}>
              <div className={styles.methodIcon}>📍</div>
              <h2 className={styles.methodTitle}>Use Your Current Location</h2>
              <p className={styles.methodDesc}>
                We'll use your device GPS to find all PGs near you right now.
              </p>
              {error && <p className={styles.error}>{error}</p>}
              <button
                className={styles.primaryBtn}
                onClick={handleUseGPS}
                disabled={loading}
                id="btn-use-gps"
              >
                {loading ? <><span className={styles.spinner} /> Locating…</> : "📍 Find PGs Near Me"}
              </button>
            </div>
          )}

          {/* Preset College / Place Method */}
          {method === "preset" && (
            <div className={`${styles.methodPanel} animate-fade-up`}>

              {/* GPS denied — ask to allow */}
              {gpsNeeded && !placesLoading && (
                <>
                  <div className={styles.methodIcon}>📍</div>
                  <h2 className={styles.methodTitle}>Allow Location Access</h2>
                  <p className={styles.methodDesc}>
                    We need your location to show real nearby places — schools, hospitals, bus stops, malls within 1km of you.
                  </p>
                  <button
                    className={styles.primaryBtn}
                    onClick={handlePresetTabClick}
                    id="btn-allow-gps"
                  >
                    📍 Allow Location & Show Landmarks
                  </button>
                  <p className={styles.detectedNote} style={{ marginTop: 12 }}>
                    Or type a place name below to search directly
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="e.g. Vishal Mart, JSS College…"
                      value={presetQuery}
                      onChange={(e) => setPresetQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && geocodeAndSearch(presetQuery)}
                      id="input-place-manual"
                      style={{ flex: 1, margin: 0 }}
                    />
                    <button
                      className={styles.primaryBtn}
                      onClick={() => geocodeAndSearch(presetQuery)}
                      disabled={!presetQuery.trim() || geocoding}
                      style={{ flexShrink: 0, padding: "0 18px", margin: 0 }}
                    >
                      {geocoding ? <span className={styles.spinner} /> : "→"}
                    </button>
                  </div>
                  {error && <p className={styles.error}>{error}</p>}
                </>
              )}

              {/* Normal flow — GPS allowed */}
              {!gpsNeeded && (
                <>
                  <h2 className={styles.methodTitle}>
                    {placesLoading ? "Finding Nearby Places…" : usingDetected ? "Landmarks Near You" : "Select a Place"}
                  </h2>
                  <p className={styles.methodDesc}>
                    {placesLoading
                      ? "Checking schools, colleges, hospitals & shops within 1 km of you"
                      : usingDetected
                      ? "Within 2 km of your current location. Or type to search any place."
                      : "Select from popular places or type any location below."}
                  </p>

                  {/* Loading */}
                  {placesLoading && (
                    <div className={styles.placesLoadingBox}>
                      <span className={styles.spinner} />
                      <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 8 }}>
                        Scanning nearby landmarks…
                      </span>
                    </div>
                  )}

                  {/* Search / filter box */}
                  {!placesLoading && (
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder={usingDetected ? "Filter list or type any place…" : "Type any place (e.g. Vishal Mart)"}
                      value={presetQuery}
                      onChange={(e) => { setPresetQuery(e.target.value); setSelectedPreset(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const matches = (nearbyPlaces.length > 0 ? nearbyPlaces : FALLBACK_PLACES)
                            .filter(p => p.name.toLowerCase().includes(presetQuery.toLowerCase()) || p.short.toLowerCase().includes(presetQuery.toLowerCase()));
                          if (matches.length === 0 && presetQuery.trim()) geocodeAndSearch(presetQuery);
                        }
                      }}
                      id="input-preset-search"
                    />
                  )}

                  {/* Landmark list — no distance badges */}
                  {!placesLoading && (() => {
                    const list = (nearbyPlaces.length > 0 ? nearbyPlaces : FALLBACK_PLACES)
                      .filter(p =>
                        !presetQuery ||
                        p.name.toLowerCase().includes(presetQuery.toLowerCase()) ||
                        p.short.toLowerCase().includes(presetQuery.toLowerCase())
                      );
                    const hasTyped = presetQuery.trim().length > 0;
                    const noMatch = list.length === 0 && hasTyped;
                    return (
                      <>
                        {!noMatch && list.length > 0 && (
                          <div className={styles.presetList}>
                            {list.map((place) => (
                              <button
                                key={place.name}
                                className={`${styles.presetItem} ${selectedPreset?.name === place.name ? styles.presetItemSelected : ""}`}
                                onClick={() => setSelectedPreset(place)}
                                id={`preset-${place.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                              >
                                <span className={styles.presetIcon}>{place.icon || "🏛️"}</span>
                                <div className={styles.presetInfo}>
                                  <span className={styles.presetName}>{place.short}</span>
                                  {place.name !== place.short && (
                                    <span className={styles.presetFull}>{place.name}</span>
                                  )}
                                </div>
                                {selectedPreset?.name === place.name && <span className={styles.checkmark}>✓</span>}
                              </button>
                            ))}
                            {usingDetected && (
                              <p className={styles.detectedNote}>📡 Real places from OpenStreetMap · within 2 km</p>
                            )}
                          </div>
                        )}

                        {/* No match in list — show geocode search */}
                        {noMatch && !geocodeResult && (
                          <div className={styles.placesLoadingBox} style={{ flexDirection: "column", gap: 10 }}>
                            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                              "{presetQuery}" not in nearby list
                            </span>
                            <button
                              className={styles.primaryBtn}
                              onClick={() => geocodeAndSearch(presetQuery)}
                              disabled={geocoding}
                              style={{ margin: 0 }}
                              id="btn-geocode-search"
                            >
                              {geocoding
                                ? <><span className={styles.spinner} /> Locating…</>
                                : `🔍 Find PGs near "${presetQuery}"`}
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* ─── Geocode confirmation card ─── */}
                  {geocodeResult && (
                    <div className={styles.confirmCard}>
                      <div className={styles.confirmIcon}>📍</div>
                      <div className={styles.confirmBody}>
                        <div className={styles.confirmName}>{geocodeResult.name}</div>
                        {geocodeResult.distanceKm !== null ? (
                          <div className={styles.confirmDist}>
                            {geocodeResult.distanceKm < 0.1
                              ? "< 100m from you"
                              : geocodeResult.distanceKm < 1
                              ? `${Math.round(geocodeResult.distanceKm * 1000)}m from you`
                              : `${geocodeResult.distanceKm} km from you`}
                          </div>
                        ) : (
                          <div className={styles.confirmDist}>Found on the map</div>
                        )}
                        <div className={styles.confirmPrompt}>Find PGs near this place?</div>
                      </div>
                      <div className={styles.confirmActions}>
                        <button
                          className={styles.confirmYes}
                          onClick={confirmGeocodeSearch}
                          disabled={loading}
                          id="btn-confirm-geocode"
                        >
                          {loading ? <span className={styles.spinner} /> : "✓ Yes, Search"}
                        </button>
                        <button
                          className={styles.confirmNo}
                          onClick={() => { setGeocodeResult(null); setPresetQuery(""); }}
                          id="btn-cancel-geocode"
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ─── Smart error: not found ─── */}
                  {error.startsWith("__notfound__:") && (
                    <div className={styles.notFoundCard}>
                      <div className={styles.notFoundTitle}>
                        ❌ &quot;{error.slice(13)}&quot; not found on the map
                      </div>
                      <div className={styles.notFoundHint}>
                        Try a different spelling or select a nearby landmark from the list.
                      </div>
                    </div>
                  )}
                  {error && !error.startsWith("__notfound__:") && (
                    <p className={styles.error}>{error}</p>
                  )}

                  {/* Bottom action button */}
                  {!placesLoading && (() => {
                    const hasTyped = presetQuery.trim().length > 0;
                    const list = (nearbyPlaces.length > 0 ? nearbyPlaces : FALLBACK_PLACES)
                      .filter(p =>
                        !presetQuery ||
                        p.name.toLowerCase().includes(presetQuery.toLowerCase()) ||
                        p.short.toLowerCase().includes(presetQuery.toLowerCase())
                      );
                    const noMatch = list.length === 0 && hasTyped;
                    if (noMatch) return null; // button is shown inline above
                    if (selectedPreset) return (
                      <button
                        className={styles.primaryBtn}
                        onClick={handlePresetSearch}
                        disabled={loading}
                        id="btn-preset-search"
                      >
                        {loading
                          ? <><span className={styles.spinner} /> Searching…</>
                          : `🔍 Find PGs near ${selectedPreset.short}`}
                      </button>
                    );
                    // Nothing typed, nothing selected — show geocode prompt
                    if (hasTyped && !selectedPreset) return (
                      <button
                        className={styles.primaryBtn}
                        onClick={() => geocodeAndSearch(presetQuery)}
                        disabled={geocoding}
                        id="btn-geocode-typed"
                      >
                        {geocoding ? <><span className={styles.spinner} /> Locating…</> : `🔍 Find PGs near "${presetQuery}"`}
                      </button>
                    );
                    return null;
                  })()}
                </>
              )}
            </div>
          )}

          {/* Maps Link panel removed — tab hidden */}

        </div>
      ) : (
        /* ─── Results Page ─── */
        <div className={`${styles.content} animate-fade-up`}>
          <div className={styles.resultsHeader}>
            <button className={styles.backSearchBtn} onClick={() => setStep("search")} id="btn-back-search">
              ← New Search
            </button>
            <div>
              <h1 className={styles.resultsTitle}>
                {results.length} PG{results.length !== 1 ? "s" : ""} Found
              </h1>
              <p className={styles.resultsSubtitle}>
                📍 Near {searchedFrom}
                <span className={styles.radiusBadge}>
                  {expandedRadius ? "within 10 km" : "within 5 km"}
                </span>
              </p>
            </div>
          </div>

          {results.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🏠</div>
              <h2 className={styles.emptyTitle}>No PGs Found Nearby</h2>
              <p className={styles.emptyDesc}>
                No PGs are registered within {expandedRadius ? "10" : "5"} km of this location yet.
                <br />Try a different location or check back later as more PGs join!
              </p>
              <button className={styles.primaryBtn} onClick={() => setStep("search")} id="btn-try-again">
                Try Another Location
              </button>
            </div>
          ) : (
            <div className={styles.resultsList}>
              {results.map((pg, i) => (
                <div key={pg.id} className={`${styles.pgCard} animate-fade-up`} style={{ animationDelay: `${i * 0.06}s` }}>
                  {/* Distance Badge */}
                  <div className={styles.distanceBadge}>
                    <span className={styles.distanceKm}>{distanceLabel(pg.distanceKm)}</span>
                    <span className={styles.distanceMode}>{walkOrRide(pg.distanceKm)}</span>
                  </div>

                  <div className={styles.pgCardBody}>
                    <div className={styles.pgInfo}>
                      <h2 className={styles.pgName}>{pg.name}</h2>
                      <span className={styles.pgType}>{typeLabel(pg.type)}</span>
                      {pg.sharings && pg.sharings.length > 0 && (
                        <div className={styles.pgSharings}>
                          {pg.sharings.sort((a, b) => a - b).map((s) => (
                            <span key={s} className={styles.sharingChip}>{s}-Share</span>
                          ))}
                        </div>
                      )}
                      {pg.address && (
                        <p className={styles.pgAddress}>📍 {pg.address}</p>
                      )}
                    </div>

                    {/* Buttons row */}
                    <div className={styles.pgCardBtns}>
                      {/* Directions */}
                      {(pg.latitude && pg.longitude) || pg.locationLink ? (
                        <a
                          href={getDirectionsUrl(pg, searchCoords || userCoords)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.locationBtn}
                          id={`btn-map-${pg.id}`}
                        >
                          🗺️ Get Directions
                        </a>
                      ) : null}

                      {/* Enquire — call manager */}
                      {pg.managerPhone && (
                        <a
                          href={`tel:${pg.managerPhone.replace(/\D/g, "")}`}
                          className={styles.enquireBtn}
                          id={`btn-enquire-${pg.id}`}
                        >
                          📞 Enquire
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Expand radius button — show only when at 5km and not yet expanded */}
              {!expandedRadius && (
                <div className={styles.expandRadiusBox}>
                  <p className={styles.expandRadiusHint}>
                    Showing PGs within 5 km. More may be available farther away.
                  </p>
                  <button
                    className={styles.expandRadiusBtn}
                    onClick={handleExpandRadius}
                    disabled={loading}
                    id="btn-expand-radius"
                  >
                    {loading ? <><span className={styles.spinner} /> Loading…</> : "🔍 Show PGs 5–10 km away"}
                  </button>
                </div>
              )}
              {expandedRadius && results.length > 0 && (
                <p className={styles.detectedNote} style={{ textAlign: "center", padding: "12px 0" }}>
                  Showing all PGs within 10 km — that’s everything we have!
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
