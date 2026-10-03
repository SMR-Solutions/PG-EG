"use client";

import { useState, useEffect, useLayoutEffect, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./page.module.css";
import AppLogo from "@/components/AppLogo";

// Dynamically import map (avoids SSR issues with MapLibre WebGL)
const PGMap = lazy(() => import("@/components/PGMap"));

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

// ─── Cache (module-level so readCacheSync is safe on client) ─────────────────
const CACHE_KEY = "pg_eg_last_search";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type SearchCache = {
  results: PGResult[];
  searchCoords: { lat: number; lng: number };
  userCoords: { lat: number; lng: number } | null;
  searchedFrom: string;
  expandedRadius: boolean;
  savedAt: number;
};

/** Read cache ONCE synchronously — only called client-side (ssr: false). */
function readCacheSync(): SearchCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: SearchCache = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

// ─── Landmarks cache ────────────────────────────────────────────────
// Landmarks rarely change, so 30-minute TTL is fine.
// Key is rounded lat/lng so nearby GPS readings reuse the same cache.
const LANDMARKS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function landmarkCacheKey(lat: number, lng: number) {
  // Round to 2 decimal places (~1.1 km grid) so slight GPS jitter reuses cache
  return `pg_eg_landmarks_${lat.toFixed(2)}_${lng.toFixed(2)}`;
}

type LandmarkCache = {
  places: Place[];
  usingDetected: boolean;
  savedAt: number;
};

function saveLandmarkCache(lat: number, lng: number, places: Place[], usingDetected: boolean) {
  try {
    const payload: LandmarkCache = { places, usingDetected, savedAt: Date.now() };
    localStorage.setItem(landmarkCacheKey(lat, lng), JSON.stringify(payload));
  } catch { /* noop */ }
}

function loadLandmarkCache(lat: number, lng: number): LandmarkCache | null {
  try {
    const raw = localStorage.getItem(landmarkCacheKey(lat, lng));
    if (!raw) return null;
    const parsed: LandmarkCache = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > LANDMARKS_CACHE_TTL) {
      localStorage.removeItem(landmarkCacheKey(lat, lng));
      return null;
    }
    return parsed;
  } catch { return null; }
}

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

  // Read session cache ONCE synchronously at first render — safe because this
  // component is ONLY rendered on the client (ssr: false in page.tsx).
  // Uses localStorage so it persists across tab close/reopen (not just same-tab refresh).
  const [cachedData] = useState<SearchCache | null>(readCacheSync);

  const [step, setStep] = useState<Step>(cachedData ? "results" : "search");
  const [method, setMethod] = useState<LocationMethod>("gps");
  const [locationLink, setLocationLink] = useState("");
  const [presetQuery, setPresetQuery] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<Place | null>(null);
  const [results, setResults] = useState<PGResult[]>(cachedData?.results ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchedFrom, setSearchedFrom] = useState(cachedData?.searchedFrom ?? "");

  // Nearby places (dynamic via server proxy)
  const [nearbyPlaces, setNearbyPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(cachedData?.userCoords ?? null);
  const [usingDetected, setUsingDetected] = useState(false);
  const [gpsNeeded, setGpsNeeded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  // Geocode confirmation step
  const [geocodeResult, setGeocodeResult] = useState<{
    name: string; lat: number; lng: number; distanceKm: number | null;
  } | null>(null);
  // Search radius state
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(cachedData?.searchCoords ?? null);
  const [expandedRadius, setExpandedRadius] = useState(cachedData?.expandedRadius ?? false);
  // Map vs List toggle
  const [mapView, setMapView] = useState(false);
  // Type filter for results
  const [typeFilter, setTypeFilter] = useState<"all" | "gents" | "ladies" | "coliving">("all");

  // Derived: filtered results based on typeFilter
  const filteredResults = typeFilter === "all"
    ? results
    : results.filter((pg) => {
        if (typeFilter === "gents") return pg.type === "gents";
        if (typeFilter === "ladies") return pg.type === "ladies";
        if (typeFilter === "coliving") return pg.type !== "gents" && pg.type !== "ladies";
        return true;
      });

  // ─── Cache helpers ────────────────────────────────────────────────────
  function saveCache(payload: Omit<SearchCache, "savedAt">) {
    try {
      const data = { ...payload, savedAt: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      if (process.env.NODE_ENV === "development") {
        console.log(`[PGFind] ✅ saveCache: stored ${payload.results.length} PGs to localStorage key "${CACHE_KEY}"`);
        // Verify it actually saved
        const verify = localStorage.getItem(CACHE_KEY);
        console.log("[PGFind] verify read-back:", verify ? "✓ found" : "✗ MISSING after save!");
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.error("[PGFind] ❌ saveCache FAILED:", e);
      }
    }
  }

  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
  }


  // Auth guard — redirect to sign-in if not logged in
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/find-pg&role=user");
    }
  }, [isLoading, isAuthenticated, router]);

  // ─── Cache restore safety-net ─────────────────────────────────────────
  // The useState(readCacheSync) lazy initializer is the primary mechanism.
  // This useLayoutEffect is a belt-and-suspenders fallback: if the lazy
  // initializer returned null for any reason (Next.js quirk, timing, etc.)
  // but localStorage DOES have fresh data, restore it synchronously before
  // the browser paints so there's no visible flash of the search screen.
  // Safe to use here because this component is ONLY client-side (ssr: false).
  useLayoutEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const raw = localStorage.getItem(CACHE_KEY);
      console.log("[PGFind] mount | step:", step === "results" ? "results ✓" : "search | checking localStorage...");
      if (raw) {
        try {
          const d = JSON.parse(raw);
          const age = Math.round((Date.now() - d.savedAt) / 1000);
          console.log(`[PGFind] localStorage has ${d.results?.length ?? 0} PGs, age ${age}s`);
        } catch { console.warn("[PGFind] localStorage parse failed"); }
      } else {
        console.log("[PGFind] localStorage: no cache key found");
      }
    }

    if (step !== "search") return; // lazy initializer already handled it

    const cached = readCacheSync();
    if (!cached) return;

    // Restore state synchronously (before paint → no visible flash)
    setResults(cached.results);
    setSearchCoords(cached.searchCoords);
    setUserCoords(cached.userCoords ?? null);
    setSearchedFrom(cached.searchedFrom);
    setExpandedRadius(cached.expandedRadius ?? false);
    setStep("results");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once on mount

  // Background refresh — silently re-fetch to keep cached results current
  useEffect(() => {
    if (!cachedData) return;
    const { lat, lng } = cachedData.searchCoords;
    const radius = cachedData.expandedRadius ? 10 : 5;
    fetch(`${API_URL}/api/public/pgs/nearby?lat=${lat}&lng=${lng}&radius=${radius}`)
      .then((r) => r.json())
      .then((data) => {
        const fresh: PGResult[] = data.results || [];
        if (JSON.stringify(fresh) !== JSON.stringify(cachedData.results)) {
          setResults(fresh);
          saveCache({ results: fresh, searchCoords: cachedData.searchCoords, userCoords: cachedData.userCoords, searchedFrom: cachedData.searchedFrom, expandedRadius: cachedData.expandedRadius });
        }
      })
      .catch(() => { /* keep cached results on network failure */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // Swipe-to-close sidebar
  let touchStartX = 0;
  function onSidebarTouchStart(e: React.TouchEvent) { touchStartX = e.touches[0].clientX; }
  function onSidebarTouchEnd(e: React.TouchEvent) {
    if (e.changedTouches[0].clientX - touchStartX > 60) setProfileOpen(false);
  }

  // ─── Detect nearby landmarks — calls our server which proxies Overpass ───
  async function fetchNearbyLandmarks(lat: number, lng: number) {
    // Check landmarks cache first — skip the API call if fresh data exists
    const cached = loadLandmarkCache(lat, lng);
    if (cached) {
      setNearbyPlaces(cached.places);
      setUsingDetected(cached.usingDetected);
      setPlacesLoading(false);
      return;
    }

    setPlacesLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/public/nearby-places?lat=${lat}&lng=${lng}`
      );
      const data = await res.json();

      if (res.ok && data.places?.length > 0) {
        setNearbyPlaces(data.places);
        setUsingDetected(true);
        saveLandmarkCache(lat, lng, data.places, true); // save to cache
      } else {
        // No results from OSM — use hardcoded fallback
        setNearbyPlaces(FALLBACK_PLACES);
        setUsingDetected(false);
        saveLandmarkCache(lat, lng, FALLBACK_PLACES, false);
      }
    } catch {
      setNearbyPlaces(FALLBACK_PLACES);
      setUsingDetected(false);
    } finally {
      setPlacesLoading(false);
    }
  }

  // When preset tab is activated, check cache before asking GPS / hitting API
  function handlePresetTabClick() {
    setMethod("preset");
    setError("");
    setSelectedPreset(null);
    setGpsNeeded(false);
    setPresetQuery("");

    // 1️⃣ Already have coords — check cache first, fetch if stale
    if (userCoords) {
      const cached = loadLandmarkCache(userCoords.lat, userCoords.lng);
      if (cached) {
        // Instant restore — no spinner, no API call
        setNearbyPlaces(cached.places);
        setUsingDetected(cached.usingDetected);
        return;
      }
      fetchNearbyLandmarks(userCoords.lat, userCoords.lng);
      return;
    }

    // 2️⃣ No coords yet — ask GPS then fetch/load cache
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
        fetchNearbyLandmarks(latitude, longitude); // will hit cache if available
      },
      () => {
        // GPS denied — show prompt
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
  // gpsCoords: pass the live GPS position when called from handleUseGPS so
  // the cache saves the correct userCoords (React state batching means
  // the userCoords closure value is still null at saveCache time).
  async function fetchNearby(
    lat: number,
    lng: number,
    fromLabel: string,
    radius = 5,
    gpsCoords?: { lat: number; lng: number }
  ) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/public/pgs/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      const found: PGResult[] = data.results || [];

      let finalResults = found;
      let finalExpanded = radius >= 10;

      // Auto-expand: if nothing in 5km, try 10km silently
      if (found.length === 0 && radius === 5) {
        const res2 = await fetch(`${API_URL}/api/public/pgs/nearby?lat=${lat}&lng=${lng}&radius=10`);
        const data2 = await res2.json();
        finalResults = data2.results || [];
        finalExpanded = true;
      }

      setResults(finalResults);
      setSearchCoords({ lat, lng });
      setSearchedFrom(fromLabel);
      setExpandedRadius(finalExpanded);
      setMapView(false);
      setTypeFilter("all");
      setStep("results");

      // Prefer the explicitly passed gpsCoords to avoid stale-closure bug
      saveCache({
        results: finalResults,
        searchCoords: { lat, lng },
        userCoords: gpsCoords ?? userCoords,
        searchedFrom: fromLabel,
        expandedRadius: finalExpanded,
      });
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
        const gpsCoords = { lat: latitude, lng: longitude };
        setUserCoords(gpsCoords); // store for blue dot on map
        // Pass gpsCoords explicitly — state update above is async, so
        // userCoords in the fetchNearby closure would still be the old value.
        fetchNearby(latitude, longitude, "Your Current Location", 5, gpsCoords);
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
        <AppLogo
          size="sm"
          onClick={() => {
            if (step !== "search") {
              setStep("search");
              setSelectedPreset(null);
              setError("");
            }
          }}
        />
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
              type="button"
              className={`${styles.methodTab} ${method === "gps" ? styles.methodTabActive : ""}`}
              onClick={() => { setMethod("gps"); setError(""); }}
              id="tab-gps"
            >
              📍 My Location
            </button>
            <button
              type="button"
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
            <button className={styles.backSearchBtn} onClick={() => { clearCache(); setStep("search"); }} id="btn-back-search">
              ← New Search
            </button>
            <div className={styles.resultsCenter}>
              <div>
                <h1 className={styles.resultsTitle}>
                  <span className={styles.highlightMarker}>
                    {filteredResults.length}{typeFilter !== "all" ? ` of ${results.length}` : ""} PG{filteredResults.length !== 1 ? "s" : ""} Found
                  </span>
                </h1>
                <p className={styles.resultsSubtitle}>
                  📍 Near {searchedFrom}
                  <span className={styles.radiusBadge}>
                    {expandedRadius ? "within 10 km" : "within 5 km"}
                  </span>
                </p>
              </div>
              {/* List / Map toggle */}
              {results.length > 0 && (
                <div className={styles.viewToggle}>
                  <button
                    type="button"
                    className={`${styles.viewToggleBtn} ${!mapView ? styles.viewToggleActive : ""}`}
                    onClick={() => setMapView(false)}
                    id="btn-list-view"
                  >☰ List</button>
                  <button
                    type="button"
                    className={`${styles.viewToggleBtn} ${mapView ? styles.viewToggleActive : ""}`}
                    onClick={() => setMapView(true)}
                    id="btn-map-view"
                  >🗺️ Map</button>
                </div>
              )}
            </div>
          </div>

          {/* ─── Type Filter Chips ─── */}
          {results.length > 0 && (
            <div className={styles.typeFilters}>
              {([
                { key: "all",     label: "All",       emoji: "🏠" },
                { key: "gents",   label: "Gents",     emoji: "🚹" },
                { key: "ladies",  label: "Ladies",    emoji: "🚺" },
                { key: "coliving",label: "Co-Living",  emoji: "🧑‍🤝‍🧑" },
              ] as const).map(({ key, label, emoji }) => {
                const count = key === "all" ? results.length
                  : key === "gents" ? results.filter(p => p.type === "gents").length
                  : key === "ladies" ? results.filter(p => p.type === "ladies").length
                  : results.filter(p => p.type !== "gents" && p.type !== "ladies").length;
                return (
                  <button
                    key={key}
                    id={`btn-filter-${key}`}
                    className={`${styles.filterChip} ${typeFilter === key ? styles.filterChipActive : ""}`}
                    onClick={() => setTypeFilter(typeFilter === key && key !== "all" ? "all" : key)}
                    disabled={count === 0 && key !== "all"}
                  >
                    {emoji} {label}
                    <span className={styles.filterCount}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ─── Map View ─── */}
          {mapView && results.length > 0 && (
            <div className={styles.mapContainer}>
              <Suspense fallback={<div className={styles.mapLoading}><span className={styles.spinner} /> Loading map…</div>}>
                <PGMap
                  pgs={filteredResults}
                  userCoords={userCoords}
                  searchCoords={searchCoords}
                  theme={theme}
                  user={owner ? { name: owner.name, phone: owner.phone, email: owner.email ?? null } : null}
                />
              </Suspense>
            </div>
          )}

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
            !mapView && <div className={styles.resultsList}>
              {filteredResults.length === 0 ? (
                <div className={styles.emptyState} style={{ marginTop: 0 }}>
                  <div className={styles.emptyIcon}>🔍</div>
                  <h2 className={styles.emptyTitle}>No {typeFilter === "gents" ? "Gents" : typeFilter === "ladies" ? "Ladies" : "Co-Living"} PGs Found</h2>
                  <p className={styles.emptyDesc}>No {typeFilter} PGs in this area. Try a different filter.</p>
                  <button className={styles.primaryBtn} onClick={() => setTypeFilter("all")} id="btn-clear-filter">Show All PGs</button>
                </div>
              ) : filteredResults.map((pg, i) => (
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
