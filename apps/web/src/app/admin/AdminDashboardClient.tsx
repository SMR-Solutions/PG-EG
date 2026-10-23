"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLogo from "@/components/AppLogo";
import AdminPGDetailModal from "./AdminPGDetailModal";
import styles from "./admin.module.css";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SESSION_ADMIN_KEY = "pg_eg_admin_key";

interface PGItem {
  id: string;
  name: string;
  type: "gents" | "ladies" | "coliving";
  isActive: boolean;
  totalFloors: number;
  totalBeds: number;
  roomsCount: number;
  address: string;
  city: string;
  locationLink?: string;
  managerName?: string;
  managerPhone?: string;
  baseRent?: number;
  sharings: number[];
  imagesCount: number;
  firstImage?: string | null;
  hasLiveVideo: boolean;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    photoUrl?: string | null;
    role: string;
    createdAt: string;
  };
}

interface Metrics {
  totalPgs: number;
  activePgs: number;
  inactivePgs: number;
  totalBeds: number;
  liveVideosCount: number;
  totalOwners: number;
  totalRooms: number;
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { token, role, owner, signOut, isLoading, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(3);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Authentication State
  const [adminKey, setAdminKey] = useState<string>("");
  const [isAuthorized, setIsAuthorized] = useState<boolean>(role === "admin");
  const [keyInput, setKeyInput] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Data State
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [pgs, setPgs] = useState<PGItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string>("");

  // Filters
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "gents" | "ladies" | "coliving">("all");

  // Selected PG for inspection modal
  const [selectedPgId, setSelectedPgId] = useState<string | null>(null);

  const getHeaders = useCallback(
    (extraKey?: string): Record<string, string> => {
      const h: Record<string, string> = {};
      if (token) h["Authorization"] = `Bearer ${token}`;
      const activeKey = extraKey || adminKey;
      if (activeKey) h["x-admin-key"] = activeKey;
      return h;
    },
    [token, adminKey]
  );

  // Fetch full PGs list
  const fetchPGsList = useCallback(async (keyOverride?: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/pgs`, {
        headers: getHeaders(keyOverride),
      });
      if (res.ok) {
        const json = await res.json();
        setPgs(json.pgs || []);
      }
    } catch (err) {
      console.error("Failed to fetch PGs:", err);
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  // Load metrics
  const fetchMetrics = useCallback(async (keyOverride?: string) => {
    const res = await fetch(`${API_URL}/api/admin/metrics`, {
      headers: getHeaders(keyOverride),
    });
    if (!res.ok) throw new Error("Unauthorized admin access");
    const data = await res.json();
    setMetrics(data);
    return data;
  }, [getHeaders]);

  // Auto-redirect unauthorized accounts
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/sign-in?from=/admin");
      return;
    }

    if (role !== "admin") {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            const target = role === "user" ? "/find-pg" : "/dashboard";
            window.location.href = target;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isAuthenticated, isLoading, role, router]);

  // Initialize: if logged in as admin, load data automatically!
  useEffect(() => {
    if (role === "admin" && token) {
      setIsAuthorized(true);
      fetchMetrics()
        .then(() => fetchPGsList())
        .catch(() => {});
      return;
    }
    const saved = sessionStorage.getItem(SESSION_ADMIN_KEY);
    if (saved) {
      setAdminKey(saved);
      validateKey(saved);
    }
  }, [role, token]);

  // Validate admin key against metrics endpoint
  async function validateKey(keyToTest: string) {
    try {
      setAuthLoading(true);
      setAuthError("");
      const res = await fetch(`${API_URL}/api/admin/metrics`, {
        headers: { "x-admin-key": keyToTest },
      });
      if (!res.ok) {
        throw new Error("Invalid Admin Passkey");
      }
      const data = await res.json();
      setMetrics(data);
      setAdminKey(keyToTest);
      sessionStorage.setItem(SESSION_ADMIN_KEY, keyToTest);
      setIsAuthorized(true);
      fetchPGsList(keyToTest);
    } catch (err: any) {
      setAuthError(err.message || "Invalid passkey. Access denied.");
      setIsAuthorized(false);
    } finally {
      setAuthLoading(false);
    }
  }

  // Refresh all data
  function handleRefresh() {
    fetchMetrics()
      .then(() => fetchPGsList())
      .catch(() => {
        if (adminKey) validateKey(adminKey);
      });
  }

  // Sign out admin
  function handleSignOut() {
    sessionStorage.removeItem(SESSION_ADMIN_KEY);
    setAdminKey("");
    setIsAuthorized(false);
    setPgs([]);
    setMetrics(null);
    signOut();
    window.location.href = "/sign-in";
  }

  // Toggle Active/Inactive status for a PG
  async function handleToggleStatus(pg: PGItem) {
    const nextStatus = !pg.isActive;

    // Optimistic UI update
    setPgs((prev) =>
      prev.map((item) => (item.id === pg.id ? { ...item, isActive: nextStatus } : item))
    );
    setMetrics((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        activePgs: nextStatus ? prev.activePgs + 1 : Math.max(0, prev.activePgs - 1),
        inactivePgs: nextStatus ? Math.max(0, prev.inactivePgs - 1) : prev.inactivePgs + 1,
      };
    });

    try {
      const res = await fetch(`${API_URL}/api/admin/pgs/${pg.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getHeaders(),
        },
        body: JSON.stringify({ isActive: nextStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update status on server");
      }

      showNotice(`"${pg.name}" is now ${nextStatus ? "ACTIVE" : "INACTIVE"}`);
    } catch (err) {
      // Revert on error
      setPgs((prev) =>
        prev.map((item) => (item.id === pg.id ? { ...item, isActive: !nextStatus } : item))
      );
      alert("Failed to update status. Please try again.");
    }
  }

  function showNotice(msg: string) {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(""), 4000);
  }

  // Filtered PGs in memory
  const filteredPgs = useMemo(() => {
    return pgs.filter((item) => {
      // Status filter
      if (statusFilter === "active" && !item.isActive) return false;
      if (statusFilter === "inactive" && item.isActive) return false;

      // Type filter
      if (typeFilter !== "all" && item.type !== typeFilter) return false;

      // Search term
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesCity = item.city.toLowerCase().includes(q);
        const matchesAddress = item.address.toLowerCase().includes(q);
        const matchesOwner = item.owner.name.toLowerCase().includes(q);
        const matchesPhone = item.owner.phone.includes(q) || (item.managerPhone && item.managerPhone.includes(q));
        if (!matchesName && !matchesCity && !matchesAddress && !matchesOwner && !matchesPhone) {
          return false;
        }
      }

      return true;
    });
  }, [pgs, statusFilter, typeFilter, search]);

  // Callback when status is updated inside modal
  const handleModalStatusChange = (pgId: string, newStatus: boolean) => {
    setPgs((prev) =>
      prev.map((item) => (item.id === pgId ? { ...item, isActive: newStatus } : item))
    );
    setMetrics((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        activePgs: newStatus ? prev.activePgs + 1 : Math.max(0, prev.activePgs - 1),
        inactivePgs: newStatus ? Math.max(0, prev.inactivePgs - 1) : prev.inactivePgs + 1,
      };
    });
  };

  // Loading state
  if (!mounted || isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#080c14",
          color: "#94a3b8",
          fontFamily: "system-ui, -apple-system, sans-serif",
          gap: "14px",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: "3px solid rgba(59, 130, 246, 0.2)",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ margin: 0, fontSize: "0.92rem", letterSpacing: "0.02em" }}>
          Verifying credentials...
        </p>
      </div>
    );
  }

  // Not signed in
  if (!isAuthenticated) {
    return null;
  }

  // Signed in, but NOT an admin
  if (role !== "admin") {
    const returnTarget = role === "user" ? "/find-pg" : "/dashboard";
    const targetLabel = role === "user" ? "Find PGs" : "Owner Dashboard";

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at top, #111827 0%, #080c14 100%)",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "460px",
            width: "100%",
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "16px",
            padding: "36px 28px",
            textAlign: "center",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(239, 68, 68, 0.1)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              margin: "0 auto 18px",
            }}
          >
            🛡️
          </div>

          <h2
            style={{
              margin: "0 0 8px",
              fontSize: "1.35rem",
              fontWeight: "700",
              letterSpacing: "-0.01em",
              color: "#f8fafc",
            }}
          >
            Admin Access Restricted
          </h2>

          <p
            style={{
              margin: "0 0 16px",
              fontSize: "0.92rem",
              color: "#94a3b8",
              lineHeight: 1.5,
            }}
          >
            This portal is strictly reserved for designated platform administrators.
          </p>

          <div
            style={{
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(51, 65, 85, 0.8)",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "20px",
              fontSize: "0.85rem",
              color: "#cbd5e1",
              textAlign: "left",
            }}
          >
            <div
              style={{
                color: "#64748b",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 3,
              }}
            >
              Signed In Account
            </div>
            <div style={{ fontWeight: 600, color: "#f1f5f9" }}>
              {owner?.email || owner?.phone || "Non-admin Account"}
            </div>
            <div style={{ color: "#ef4444", fontSize: "0.78rem", marginTop: 4 }}>
              Status: Unauthorized for Admin Console
            </div>
          </div>

          <p
            style={{
              fontSize: "0.82rem",
              color: "#64748b",
              marginBottom: "20px",
            }}
          >
            Redirecting to {targetLabel} in {countdown}s...
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              onClick={() => {
                window.location.href = returnTarget;
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "#3b82f6",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                fontWeight: "600",
                fontSize: "0.92rem",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            >
              Continue to {targetLabel} →
            </button>

            <button
              onClick={() => {
                signOut();
                window.location.href = "/sign-in?from=/admin";
              }}
              style={{
                width: "100%",
                padding: "10px 16px",
                background: "transparent",
                color: "#94a3b8",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "10px",
                fontWeight: "500",
                fontSize: "0.88rem",
                cursor: "pointer",
              }}
            >
              Sign In with Admin Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} data-theme={theme}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      {/* Top Navigation */}
      <header className={styles.topNav}>
        <div className={styles.topNavInner}>
          <div className={styles.brandGroup}>
            <AppLogo size="sm" />
            <span className={styles.adminBadge}>Admin Console</span>
          </div>

          <div className={styles.navControls}>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={styles.refreshBtn}
              title="Toggle theme"
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>

            {isAuthorized && (
              <>
                <button onClick={handleRefresh} className={styles.refreshBtn} title="Reload data">
                  🔄 Refresh
                </button>
                <button onClick={handleSignOut} className={styles.signOutBtn} title="Sign out of admin console">
                  🚪 Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Admin Access Gate Modal (if not authorized) */}
      {!isAuthorized && (
        <div className={styles.gateBackdrop}>
          <div className={styles.gateCard}>
            <div className={styles.gateIcon}>🛡️</div>
            <h1 className={styles.gateTitle}>PG-EG Admin Access</h1>
            <p className={styles.gateSub}>
              Enter your master administrative passkey to inspect and manage all platform PGs.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                validateKey(keyInput.trim());
              }}
              className={styles.gateForm}
            >
              <input
                type="password"
                className={styles.gateInput}
                placeholder="Enter master admin passkey"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />

              {authError && <p className={styles.gateError}>{authError}</p>}

              <button type="submit" className={styles.gateSubmitBtn} disabled={authLoading}>
                {authLoading ? "Authenticating…" : "Unlock Admin Dashboard"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main Dashboard Workspace (when authorized) */}
      {isAuthorized && (
        <main className={styles.main}>
          {/* Toast Notification Banner */}
          {actionNotice && (
            <div
              style={{
                position: "fixed",
                bottom: 24,
                right: 24,
                zIndex: 90,
                background: "#0f172a",
                color: "#22c55e",
                border: "1px solid #22c55e",
                padding: "12px 20px",
                borderRadius: 12,
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                fontWeight: 700,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ✓ {actionNotice}
            </div>
          )}

          <div className={styles.titleBlock}>
            <h1 className={styles.heading}>Platform PG Management</h1>
            <p className={styles.subHeading}>
              Manage listing visibility, verify owner profiles, and control all PGs across the platform.
            </p>
          </div>

          {/* KPI Summary Cards */}
          {metrics && (
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statIconBox} style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" }}>
                  🏢
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statValue}>{metrics.totalPgs}</span>
                  <span className={styles.statLabel}>Total PGs Listed</span>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIconBox} style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80" }}>
                  🟢
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statValue} style={{ color: "#4ade80" }}>{metrics.activePgs}</span>
                  <span className={styles.statLabel}>Active PGs</span>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIconBox} style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}>
                  🔴
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statValue} style={{ color: metrics.inactivePgs > 0 ? "#f87171" : "#94a3b8" }}>
                    {metrics.inactivePgs}
                  </span>
                  <span className={styles.statLabel}>Inactive PGs</span>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIconBox} style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc" }}>
                  👥
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statValue}>{metrics.totalOwners}</span>
                  <span className={styles.statLabel}>Registered Owners</span>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIconBox} style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}>
                  🛏️
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statValue}>{metrics.totalBeds}</span>
                  <span className={styles.statLabel}>Platform Beds</span>
                </div>
              </div>
            </div>
          )}

          {/* Search & Filter Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.searchRow}>
              <div className={styles.searchInputWrapper}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search by PG Name, City, Address, Owner Name, or Phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "none",
                    color: "#94a3b8",
                    padding: "8px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Clear search
                </button>
              )}
            </div>

            <div className={styles.filtersRow}>
              {/* Status Filter Tabs */}
              <div className={styles.pillGroup}>
                <button
                  type="button"
                  className={`${styles.pillBtn} ${statusFilter === "all" ? styles.pillBtnActive : ""}`}
                  onClick={() => setStatusFilter("all")}
                >
                  All ({pgs.length})
                </button>
                <button
                  type="button"
                  className={`${styles.pillBtn} ${statusFilter === "active" ? styles.pillBtnActive : ""}`}
                  onClick={() => setStatusFilter("active")}
                >
                  Active ({metrics?.activePgs ?? pgs.filter((p) => p.isActive).length})
                </button>
                <button
                  type="button"
                  className={`${styles.pillBtn} ${statusFilter === "inactive" ? styles.pillBtnInactive : ""}`}
                  onClick={() => setStatusFilter("inactive")}
                >
                  Inactive ({metrics?.inactivePgs ?? pgs.filter((p) => !p.isActive).length})
                </button>
              </div>

              {/* PG Type Filter */}
              <div className={styles.typeFilterGroup}>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${typeFilter === "all" ? styles.typeBtnActive : ""}`}
                  onClick={() => setTypeFilter("all")}
                >
                  All Types
                </button>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${typeFilter === "gents" ? styles.typeBtnActive : ""}`}
                  onClick={() => setTypeFilter("gents")}
                >
                  👨 Gents
                </button>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${typeFilter === "ladies" ? styles.typeBtnActive : ""}`}
                  onClick={() => setTypeFilter("ladies")}
                >
                  👩 Ladies
                </button>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${typeFilter === "coliving" ? styles.typeBtnActive : ""}`}
                  onClick={() => setTypeFilter("coliving")}
                >
                  🤝 Co-Living
                </button>
              </div>
            </div>
          </div>

          {/* Results Summary */}
          <div className={styles.resultsBar}>
            <span className={styles.resultsCount}>
              Showing {filteredPgs.length} of {pgs.length} listed properties
            </span>
          </div>

          {/* PGs Grid / List */}
          {loading ? (
            <div className={styles.emptyState}>Loading PG properties…</div>
          ) : filteredPgs.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
              No properties match your current search or filters.
            </div>
          ) : (
            <div className={styles.pgGrid}>
              {filteredPgs.map((pg) => {
                const typeStyle =
                  pg.type === "ladies"
                    ? styles.typeLadies
                    : pg.type === "gents"
                    ? styles.typeGents
                    : styles.typeColiving;

                return (
                  <div
                    key={pg.id}
                    className={`${styles.pgCard} ${!pg.isActive ? styles.pgCardInactive : ""}`}
                  >
                    {/* Card Header */}
                    <div className={styles.cardHeader}>
                      <div className={styles.cardMainInfo}>
                        {pg.firstImage ? (
                          <img src={pg.firstImage} alt={pg.name} className={styles.pgThumb} />
                        ) : (
                          <div className={styles.pgThumbPlaceholder}>🏢</div>
                        )}

                        <div className={styles.pgTitleArea}>
                          <h2 className={styles.pgName}>{pg.name}</h2>
                          <div className={styles.tagRow}>
                            <span className={`${styles.typeBadge} ${typeStyle}`}>
                              {pg.type}
                            </span>
                            {pg.baseRent ? (
                              <span className={styles.rentBadge}>
                                ₹{pg.baseRent.toLocaleString("en-IN")}/mo
                              </span>
                            ) : null}
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>
                              📸 {pg.imagesCount} Photos
                            </span>
                            {pg.hasLiveVideo && (
                              <span className={styles.badgeLiveVideo}>
                                🔴 Live Video
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Active / Inactive Status Switch */}
                      <div className={styles.statusControlBox}>
                        <div
                          className={`${styles.statusIndicator} ${
                            pg.isActive ? styles.statusActive : styles.statusInactive
                          }`}
                        >
                          <span
                            className={`${styles.statusDot} ${
                              pg.isActive ? styles.dotActive : styles.dotInactive
                            }`}
                          />
                          {pg.isActive ? "Active" : "Inactive"}
                        </div>

                        <label className={styles.toggleSwitch} title="Toggle Active / Inactive">
                          <input
                            type="checkbox"
                            checked={pg.isActive}
                            onChange={() => handleToggleStatus(pg)}
                          />
                          <span className={styles.slider} />
                        </label>
                      </div>
                    </div>

                    {/* Card Details Grid */}
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailCol}>
                        <span className={styles.detailLabel}>Location</span>
                        <span className={styles.detailValue}>
                          {pg.address ? (
                            <>
                              📍 {pg.address}
                              {pg.locationLink && (
                                <a
                                  href={pg.locationLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.detailLink}
                                  style={{ marginLeft: 6 }}
                                >
                                  (Maps ↗)
                                </a>
                              )}
                            </>
                          ) : (
                            "No address provided"
                          )}
                        </span>
                      </div>

                      <div className={styles.detailCol}>
                        <span className={styles.detailLabel}>Manager</span>
                        <span className={styles.detailValue}>
                          {pg.managerName || "Not assigned"}
                          {pg.managerPhone && (
                            <a
                              href={`tel:${pg.managerPhone}`}
                              className={styles.detailLink}
                              style={{ display: "block", marginTop: 2 }}
                            >
                              📞 {pg.managerPhone}
                            </a>
                          )}
                        </span>
                      </div>

                      <div className={styles.detailCol}>
                        <span className={styles.detailLabel}>Registered Owner</span>
                        <span className={styles.detailValue}>
                          {pg.owner.name}
                          <a
                            href={`tel:${pg.owner.phone}`}
                            className={styles.detailLink}
                            style={{ display: "block", marginTop: 2 }}
                          >
                            📞 {pg.owner.phone}
                          </a>
                        </span>
                      </div>

                      <div className={styles.detailCol}>
                        <span className={styles.detailLabel}>Capacity</span>
                        <span className={styles.detailValue}>
                          🏢 {pg.totalFloors} Floors • 🚪 {pg.roomsCount} Rooms • 🛏️ {pg.totalBeds} Beds
                        </span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className={styles.cardActions}>
                      <button
                        className={styles.btnInspect}
                        onClick={() => setSelectedPgId(pg.id)}
                      >
                        🔍 Inspect Full Details
                      </button>

                      <a
                        href={`/pg/${pg.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.btnViewPublic}
                      >
                        🌐 View Public Site ↗
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Deep-dive Detail Modal */}
          {selectedPgId && (
            <AdminPGDetailModal
              pgId={selectedPgId}
              adminKey={adminKey}
              token={token}
              onClose={() => setSelectedPgId(null)}
              onStatusChange={handleModalStatusChange}
            />
          )}
        </main>
      )}
    </div>
  );
}
