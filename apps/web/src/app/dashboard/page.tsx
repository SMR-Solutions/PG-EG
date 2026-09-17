"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";
import AppLogo from "@/components/AppLogo";
import Building3DView from "@/components/Building3DView";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/* ─── Types ─── */
interface RentRecord { id: string; status: string; amount: number; paidAmount: number; paymentMode: string | null; paidAt: string | null; }
interface Tenant {
  id: string; name: string; phone: string; joiningDate: string;
  altPhone?: string | null;
  emergencyContact?: string | null;
  emergencyRelation?: string | null;
  photoUrl?: string | null; idPhotoUrl?: string | null;
  advanceAmount?: number; rentAmount?: number;
  depositDeduction?: number; refundMode?: string | null;
  leavingDate?: string | null;
  rent: RentRecord | null;
}
interface HistoryEvent { id: string; eventType: string; fromRoom?: string | null; toRoom?: string | null; note?: string | null; createdAt: string; }
interface TenantWithHistory extends Omit<Tenant, 'rent'> { status: string; history: HistoryEvent[]; }
interface Bed { id: string; bedNumber: number; isOccupied: boolean; tenant: Tenant | null; }
interface Room { id: string; roomNumber: string; floor: number; sharingType: number; beds: Bed[]; }
interface PGData {
  id: string; name: string; type: string; totalFloors: number;
  sharings: number[]; owner: { name: string; phone: string } | null;
  managerName: string | null; managerPhone: string | null;
}
interface DashboardData { pg: PGData; rooms: Room[]; currentMonth: string; }

/* ─── Helpers ─── */
const BED_LETTERS = "ABCDEFGHIJKLMNOP";
const TYPE_EMOJI: Record<string, string> = { gents: "🚹", ladies: "🚺", "co-living": "🧑‍🤝‍🧑" };
const SHARE_ICONS = ["", "👤", "👥", "👥", "👨‍👩‍👧‍👦", "🏠"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`;
}

function sharingStats(rooms: Room[], type: number) {
  const matching = rooms.filter((r) => r.sharingType === type);
  const totalBeds = matching.reduce((s, r) => s + r.beds.length, 0);
  const occupied = matching.reduce((s, r) => s + r.beds.filter((b) => b.isOccupied).length, 0);
  return { totalBeds, occupied, free: totalBeds - occupied, pct: totalBeds > 0 ? (occupied / totalBeds) * 100 : 0 };
}

function floorStats(rooms: Room[], floor: number) {
  const floorRooms = rooms.filter((r) => r.floor === floor);
  const totalBeds = floorRooms.reduce((s, r) => s + r.beds.length, 0);
  const occupied = floorRooms.reduce((s, r) => s + r.beds.filter((b) => b.isOccupied).length, 0);
  const pendingRent = floorRooms.some((r) =>
    r.beds.some((b) => b.tenant?.rent?.status === "pending")
  );
  return { rooms: floorRooms, totalBeds, occupied, free: totalBeds - occupied, pendingRent };
}

function floorColor(free: number, total: number) {
  if (total === 0) return "empty";
  if (free === 0) return "full";
  if (free / total <= 0.3) return "almost";
  return "available";
}

function roomHasPendingRent(room: Room) {
  return room.beds.some((b) => b.tenant?.rent?.status === "pending");
}

/** Shared whoosh — lowpass filtered noise sweep (the good one) */
function playWhoosh(short = false) {
  try {
    const ac = new AudioContext();
    const dur = short ? 0.18 : 0.32;
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(short ? 2800 : 1800, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(short ? 400 : 180, ac.currentTime + dur);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(short ? 0.16 : 0.22, ac.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.connect(filter); filter.connect(gain); gain.connect(ac.destination);
    src.start(); src.stop(ac.currentTime + dur + 0.01);
  } catch { /* ignore */ }
}

/* ─── Donut Ring ─── */
function DonutRing({ pct, free, total }: { pct: number; free: number; total: number }) {
  const r = 38, circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  const color = pct >= 100 ? "#e63946" : pct >= 80 ? "#f4a261" : "#2dc653";
  return (
    <svg viewBox="0 0 100 100" width="80" height="80" className={styles.ring}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dashoffset 0.6s ease", filter: `drop-shadow(0 0 4px ${color}66)` }} />
      <text x="50" y="45" textAnchor="middle" fill="white" fontSize="17" fontWeight="800" fontFamily="inherit">
        {total === 0 ? "—" : free}
      </text>
      <text x="50" y="60" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="inherit">
        {total === 0 ? "no rooms" : "free"}
      </text>
    </svg>
  );
}

/* ─── Main ─── */
export default function DashboardPage() {
  const router = useRouter();
  const { activePgId, allPgs, setActivePg, token, isAuthenticated, isLoading: authLoading, owner, signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  // UI state
  const [filterType, setFilterType] = useState<number | null>(null);
  const [activeFloor, setActiveFloor] = useState<number | null>(null);
  const [buildingView, setBuildingView] = useState<"list" | "3d">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("pg-eg-view") as "list" | "3d") || "list";
    }
    return "list";
  });
  const [viewDropOpen, setViewDropOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [detailTenant, setDetailTenant] = useState<{ tenant: Tenant; bed: Bed; room: Room } | null>(null);

  // Rent state
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [rentPayMode, setRentPayMode] = useState<"cash" | "upi">("cash");
  const [rentPayAmount, setRentPayAmount] = useState<string>("");

  // Move tenant state
  const [movingTenant, setMovingTenant] = useState<{ tenant: Tenant; bed: Bed; room: Room } | null>(null);
  const [moveFloor, setMoveFloor] = useState<number | null>(null);
  const [moveTargetRoom, setMoveTargetRoom] = useState<Room | null>(null);
  const [moveTargetBed, setMoveTargetBed] = useState<Bed | null>(null);
  const [moveInProgress, setMoveInProgress] = useState(false);
  const [moveFilterType, setMoveFilterType] = useState<number | null>(null);

  // Checkout modal state
  const [checkoutModal, setCheckoutModal] = useState<{ tenant: Tenant; bed: Bed; room: Room } | null>(null);
  const [deduction, setDeduction] = useState("");
  const [checkoutRefundMode, setCheckoutRefundMode] = useState<"cash" | "upi">("cash");
  const [checkingOut, setCheckingOut] = useState(false);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TenantWithHistory[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Room history state
  const [roomHistoryRoom, setRoomHistoryRoom] = useState<Room | null>(null);
  const [roomHistoryData, setRoomHistoryData] = useState<{ past: TenantWithHistory[]; moveHistory: HistoryEvent[] } | null>(null);
  const [loadingRoomHistory, setLoadingRoomHistory] = useState(false);

  // Edit contact modal state
  const [editModal, setEditModal] = useState<{
    tenantId: string; name: string;
    phone: string; altPhone: string; emergencyContact: string; emergencyRelation: string; idPhotoUrl: string | null;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editUploading, setEditUploading] = useState(false);
  const editIdCardRef = useRef<HTMLInputElement>(null);
  const sharingScrollRef = useRef<HTMLDivElement>(null);
  const sidebarSwipeX = useRef(0);

  // Profile sidebar state
  const [profileOpen, setProfileOpen] = useState(false);
  const [changingPg, setChangingPg] = useState(false);

  // Swipe-right-to-close sidebar
  const onSidebarTouchStart = (e: React.TouchEvent) => { sidebarSwipeX.current = e.touches[0].clientX; };
  const onSidebarTouchEnd   = (e: React.TouchEvent) => { if (e.changedTouches[0].clientX - sidebarSwipeX.current > 60) setProfileOpen(false); };

  // ── Helper: auth header from current token ───────────────────
  const authHeader = useCallback(
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const load = useCallback(async () => {
    // Use activePgId (selected PG) first, fall back to localStorage
    const pgId = activePgId || localStorage.getItem("pg_eg_active_pg_id") || localStorage.getItem("pg_eg_pg_id");
    if (!pgId) { setError("No PG found. Please complete setup first."); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/dashboard?pgId=${pgId}`, {
        headers: { ...authHeader() },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
      setError("");
    } catch { setError("Failed to load dashboard."); }
    finally { setLoading(false); }
  }, [activePgId, token, authHeader]);

  // ── Trigger load ONLY after auth has fully resolved ──────────────
  // Without this guard, load() fires on mount with token=null (React state
  // not yet populated from localStorage), sending an unauthenticated request
  // before refreshAuth() has finished — causing a 401 on every page refresh.
  useEffect(() => {
    if (authLoading) return;      // wait for refreshAuth() to finish
    if (!isAuthenticated) return; // redirect handled by the sign-in effect
    load();
  }, [load, authLoading, isAuthenticated]);

  // Open checkout modal instead of confirm dialog
  function openCheckout(bed: Bed, room: Room) {
    if (!bed.tenant) return;
    setCheckoutModal({ tenant: bed.tenant, bed, room });
    setDeduction("");
    setCheckoutRefundMode("cash");
  }

  async function handleCheckout() {
    if (!checkoutModal) return;
    const raw = deduction.trim();
    const dep = raw === "" ? 0 : Number(raw);
    const deposit = checkoutModal.tenant.advanceAmount || 0;
    if (!Number.isInteger(dep) || dep < 0 || dep > deposit) return;

    // Block checkout if rent is outstanding
    const rent = checkoutModal.tenant.rent;
    const outstanding = rent ? Math.max(0, rent.amount - (rent.paidAmount ?? 0)) : 0;
    if (outstanding > 0) {
      alert(`Please clear the outstanding rent of ₹${outstanding.toLocaleString("en-IN")} before checkout.`);
      return;
    }

    setCheckingOut(true);
    try {
      const res = await fetch(`${API_URL}/api/dashboard/beds/${checkoutModal.bed.id}/checkout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ depositDeduction: dep, refundMode: checkoutRefundMode }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Checkout failed");
        return;
      }
      setCheckoutModal(null);
      setSelectedRoom(null);
      setDetailTenant(null);
      await load();
    } finally { setCheckingOut(false); }
  }

  // Search handler with debounce
  function handleSearchInput(q: string) {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const pgId = localStorage.getItem("pg_eg_active_pg_id") || localStorage.getItem("pg_eg_pg_id") || "";
      const res = await fetch(
        `${API_URL}/api/tenants/search?pgId=${pgId}&q=${encodeURIComponent(q)}`,
        { headers: authHeader() }
      );
      const json = await res.json();
      setSearchResults(json.tenants || []);
      setSearching(false);
    }, 350);
  }

  async function loadRoomHistory(room: Room) {
    setRoomHistoryRoom(room);
    setLoadingRoomHistory(true);
    setRoomHistoryData(null);
    const res = await fetch(
      `${API_URL}/api/tenants/room-history/${room.id}`,
      { headers: authHeader() }
    );
    const json = await res.json();
    setRoomHistoryData(json);
    setLoadingRoomHistory(false);
  }

  async function handleMove(tenantId: string, targetBedId: string) {
    setMoveInProgress(true);
    try {
      const res = await fetch(`${API_URL}/api/tenants/${tenantId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ targetBedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Move failed");
      // Reset all move state and refresh
      setMovingTenant(null);
      setMoveFloor(null);
      setMoveTargetRoom(null);
      setMoveTargetBed(null);
      setMoveFilterType(null);
      setSelectedRoom(null);
      setDetailTenant(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Move failed");
    } finally {
      setMoveInProgress(false);
    }
  }

  async function handleMarkPaid(rentId: string, fullAmount: number) {
    const raw = rentPayAmount.trim();
    const paidAmount = raw === "" ? fullAmount : Number(raw);
    // Validation (belt-and-suspenders — button is disabled for invalid values)
    if (raw !== "" && (!Number.isFinite(paidAmount) || paidAmount <= 0 || !Number.isInteger(paidAmount))) return;
    if (raw !== "" && paidAmount > fullAmount) return;
    setMarkingPaid(rentId);
    try {
      const res = await fetch(`${API_URL}/api/rent/${rentId}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ paymentMode: rentPayMode, amount: paidAmount }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Payment failed");
        return;
      }
      setRentPayAmount("");
      await load();
      // Refresh detail view
      if (detailTenant && data) {
        const updRoom = data.rooms.find((r) => r.id === detailTenant.room.id);
        if (updRoom) {
          const updBed = updRoom.beds.find((b) => b.id === detailTenant.bed.id);
          if (updBed?.tenant) setDetailTenant({ tenant: updBed.tenant, bed: updBed, room: updRoom });
        }
      }
    } finally { setMarkingPaid(null); }
  }

  /* ─── Derived ─── */
  const totalBeds = data?.rooms.reduce((s, r) => s + r.beds.length, 0) ?? 0;
  const occupiedBeds = data?.rooms.reduce((s, r) => s + r.beds.filter((b) => b.isOccupied).length, 0) ?? 0;
  const pendingRentCount = data?.rooms.reduce((s, r) =>
    s + r.beds.filter((b) => b.tenant?.rent?.status === "pending").length, 0) ?? 0;

  const visibleRooms = filterType ? (data?.rooms.filter((r) => r.sharingType === filterType) ?? []) : (data?.rooms ?? []);
  const floorNums = data ? Array.from({ length: data.pg.totalFloors }, (_, i) => data.pg.totalFloors - i) : [];

  // Only show sharing cards for types that actually have rooms
  const activeShareTypes = data
    ? data.pg.sharings.sort((a, b) => a - b).filter((t) => sharingStats(data.rooms, t).totalBeds > 0)
    : [];

  if (authLoading || loading) return (
    <main className={styles.main}><div className={styles.centered}><span className={styles.spinner} /></div></main>
  );
  if (error || !data) return (
    <main className={styles.main}><div className={styles.centered}>
      <p className={styles.errorText}>{error || "Something went wrong"}</p>
      <button className={styles.retryBtn} onClick={() => router.push("/add-pg")}>Go to Setup</button>
    </div></main>
  );

  const { pg } = data;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />
      <div className={styles.content}>

        {/* ─── PG-EG Logo Bar ─── */}
        <div className={styles.logoBar}>
          <AppLogo size="sm" />
          {/* Profile button — top-right, boxy, same height as logo */}
          <button
            className={styles.topProfileBtn}
            onClick={() => setProfileOpen(true)}
            id="btn-open-profile"
            title={(data?.pg.managerName || owner?.name || "Profile")}
          >
            {owner?.photoUrl
              ? <img src={owner.photoUrl} alt="Profile" className={styles.topProfileImg} />
              : (data?.pg.managerName || owner?.name || "O")[0].toUpperCase()}
          </button>
        </div>

        {/* ─── Header ─── */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.pgName}>{pg.name}</div>
            <div className={styles.pgMeta}>{TYPE_EMOJI[pg.type]} {pg.type.charAt(0).toUpperCase() + pg.type.slice(1)} · {pg.totalFloors} Floors</div>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.overallStat}>
              <span className={styles.overallNum} style={{ color: (totalBeds - occupiedBeds) > 0 ? "var(--brand-green)" : "#e63946" }}>{totalBeds - occupiedBeds}</span>
              <span className={styles.overallLabel}>beds free</span>
            </div>
            <div className={styles.overallStat}>
              <span className={styles.overallNum}>{occupiedBeds}</span>
              <span className={styles.overallLabel}>occupied</span>
            </div>
            {pendingRentCount > 0 && (
              <div className={styles.overallStat}>
                <span className={styles.overallNum} style={{ color: "#f4a261" }}>⚠️ {pendingRentCount}</span>
                <span className={styles.overallLabel}>rent due</span>
              </div>
            )}
          </div>
        </header>

        {/* ─── Profile Sidebar ─── */}
        {profileOpen && (
          <div className={styles.sidebarBackdrop} onClick={() => setProfileOpen(false)}>
            <div
              className={styles.profileSidebar}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onSidebarTouchStart}
              onTouchEnd={onSidebarTouchEnd}
            >
              {/* ── Center pill tab over the sidebar ── */}
              <button
                className={styles.sidebarPillTab}
                onClick={() => setProfileOpen(false)}
                id="btn-sidebar-pill-close"
                aria-label="Close sidebar"
              >
                <span className={styles.sidebarPillArrow}>→</span>
              </button>

              {/* ── Close handle strip at the top ── */}
              <button
                className={styles.sidebarClose}
                onClick={() => setProfileOpen(false)}
                id="btn-close-sidebar"
                aria-label="Close sidebar"
              >
                <span className={styles.sidebarCloseLabel}>Close</span>
              </button>

              <div className={styles.sidebarBody}>
                {/* PG Manager info + Google account — click to open Owner Profile */}
                <button
                  className={styles.sidebarOwner}
                  style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%", padding: 0 }}
                  onClick={() => { setProfileOpen(false); router.push("/owner-profile"); }}
                  id="btn-owner-profile"
                >
                  <div className={styles.sidebarAvatar}>
                    {owner?.photoUrl
                      ? <img src={owner.photoUrl} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                      : (data?.pg.managerName || owner?.name || "O")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className={styles.sidebarOwnerName}>
                      {data?.pg.managerName || owner?.name || "Manager"}
                    </div>
                    <div className={styles.sidebarOwnerEmail}>
                      {data?.pg.managerPhone || owner?.phone || ""}
                    </div>
                    {owner?.email && (
                      <div className={styles.sidebarOwnerEmail} style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>
                        {owner.email}
                      </div>
                    )}
                  </div>
                </button>

                <div className={styles.sidebarDivider} />

                {/* Actions */}
                <button
                  className={styles.sidebarAction}
                  id="btn-add-another-pg"
                  onClick={() => { setProfileOpen(false); router.push("/add-pg?new=true"); }}
                  style={{ display: "none" }}
                >
                  <span className={styles.sidebarActionIcon}>➕</span>
                  <div>
                    <div className={styles.sidebarActionTitle}>Add Another PG</div>
                    <div className={styles.sidebarActionDesc}>Register a new property</div>
                  </div>
                </button>

                <button
                  className={styles.sidebarAction}
                  id="btn-edit-pg"
                  onClick={() => { setProfileOpen(false); router.push("/edit-pg"); }}
                >
                  <span className={styles.sidebarActionIcon}>✏️</span>
                  <div>
                    <div className={styles.sidebarActionTitle}>Edit PG</div>
                    <div className={styles.sidebarActionDesc}>Change PG details or rooms</div>
                  </div>
                </button>

                {allPgs.length > 1 && (
                  <button
                    className={styles.sidebarAction}
                    id="btn-change-pg"
                    onClick={() => { setProfileOpen(false); router.push("/select-pg"); }}
                  >
                    <span className={styles.sidebarActionIcon}>🔄</span>
                    <div>
                      <div className={styles.sidebarActionTitle}>Change PG</div>
                      <div className={styles.sidebarActionDesc}>
                        {allPgs.length} properties — switch here
                      </div>
                    </div>
                  </button>
                )}

                <div className={styles.sidebarDivider} />

                <button
                  className={`${styles.sidebarAction} ${styles.sidebarActionDanger}`}
                  id="btn-sign-out"
                  onClick={() => { signOut(); router.replace("/sign-in"); }}
                >
                  <span className={styles.sidebarActionIcon}>🚪</span>
                  <div>
                    <div className={styles.sidebarActionTitle}>Sign Out</div>
                    <div className={styles.sidebarActionDesc}>Log out of your account</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Sharing Cards — only show types with rooms ─── */}
        {activeShareTypes.length > 0 && (
          <section className={styles.sharingSection}>
            {/* Label row with chevron navigation */}
            <div className={styles.sharingNav}>
              <p className={`${styles.sectionLabel} ${styles.sharingNavLabel}`} style={{ margin: 0 }}>AVAILABILITY BY SHARING TYPE</p>
              <div className={styles.sharingNavBtns}>
                <button
                  className={styles.sharingChevron}
                  id="btn-sharing-prev"
                  aria-label="Scroll left"
                  onClick={() => sharingScrollRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
                >‹</button>
                <button
                  className={styles.sharingChevron}
                  id="btn-sharing-next"
                  aria-label="Scroll right"
                  onClick={() => sharingScrollRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
                >›</button>
              </div>
            </div>
            <div className={styles.sharingScroll} ref={sharingScrollRef}>
              {activeShareTypes.map((type) => {
                const stats = sharingStats(data.rooms, type);
                const isActive = filterType === type;
                return (
                  <button key={type}
                    className={`${styles.sharingCard} ${isActive ? styles.sharingCardActive : ""}`}
                    onClick={() => { playWhoosh(true); setFilterType(isActive ? null : type); }} id={`sharing-card-${type}`}>
                    <DonutRing pct={stats.pct} free={stats.free} total={stats.totalBeds} />
                    <div className={styles.sharingInfo}>
                      <span className={styles.sharingIcon}>{SHARE_ICONS[Math.min(type, 5)] || "🏠"}</span>
                      <span className={styles.sharingLabel}>{type}-Share</span>
                      <span className={styles.sharingDetail}>{stats.free} of {stats.totalBeds} free</span>
                    </div>
                    {isActive && <div className={styles.filterPill}>Filtering ✕</div>}
                  </button>
                );
              })}
            </div>
            {filterType && (
              <p className={styles.filterNote}>
                Showing {filterType}-sharing · <button className={styles.clearFilter} onClick={() => setFilterType(null)}>Clear</button>
              </p>
            )}
          </section>
        )}

        {/* ─── 3D Building ─── */}
        <section className={styles.buildingSection}>
          <div className={styles.buildingSectionHeader}>
            <p className={styles.sectionLabel} style={{ margin: 0 }}>🏢 {pg.name.toUpperCase()} — LIVE MAP</p>

            {/* View toggle dropdown */}
            <div className={styles.viewDropWrap} id="view-drop-wrap">
              <button
                className={styles.viewDropBtn}
                id="btn-view-drop"
                onClick={() => setViewDropOpen(v => !v)}
              >
                {buildingView === "list" ? "☰ List View" : "🏢 3D View"}
                <span className={`${styles.viewDropChevron} ${viewDropOpen ? styles.viewDropChevronUp : ""}`}>▾</span>
              </button>
              {viewDropOpen && (
                <>
                  <div className={styles.viewDropBackdrop} onClick={() => setViewDropOpen(false)} />
                  <div className={styles.viewDropMenu}>
                    <button
                      className={`${styles.viewDropItem} ${buildingView === "list" ? styles.viewDropItemActive : ""}`}
                      id="btn-view-list"
                      onClick={() => { setBuildingView("list"); localStorage.setItem("pg-eg-view", "list"); setViewDropOpen(false); }}
                    >
                      <span>☰</span> List View
                      {buildingView === "list" && <span className={styles.viewDropCheck}>✓</span>}
                    </button>
                    <button
                      className={`${styles.viewDropItem} ${buildingView === "3d" ? styles.viewDropItemActive : ""}`}
                      id="btn-view-3d"
                      onClick={() => { setBuildingView("3d"); localStorage.setItem("pg-eg-view", "3d"); setViewDropOpen(false); }}
                    >
                      <span>🏢</span> 3D View
                      {buildingView === "3d" && <span className={styles.viewDropCheck}>✓</span>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {buildingView === "3d" ? (
            /* Full 3D rotatable building */
            <Building3DView
              pgName={pg.name}
              totalFloors={pg.totalFloors}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              rooms={data.rooms as any}
              onRoomClick={(room) => setSelectedRoom(room as any)}
              filterType={filterType}
            />
          ) : (
            /* ── List View (slab building) ── */
            <div className={styles.building3dOuter}>
              <div className={styles.building3dScene}>
                <div className={styles.building3dStack}>
                  {floorNums.map((floor, idx) => {
                    const all = floorStats(data.rooms, floor);
                    const colorKey = floorColor(all.free, all.totalBeds);
                    const isActive = activeFloor === floor;
                    const floorColor3d =
                      colorKey === "full" ? "#e63946" :
                      colorKey === "almost" ? "#f4a261" : "#2dc653";
                    const allBeds = all.rooms.flatMap(r => r.beds);
                    // Filter highlighting
                    const isFloorDimmed = !!filterType && !all.rooms.some(r => r.sharingType === filterType);
                    const isFloorHighlighted = !!filterType && all.rooms.some(r => r.sharingType === filterType);

                    return (
                      <div key={floor} className={`${styles.floorSlab} ${isActive ? styles.floorSlabActive : ""}`}
                        style={{
                          "--fc": floorColor3d,
                          opacity: isFloorDimmed ? 0.22 : 1,
                          filter: isFloorDimmed ? "grayscale(0.7)" : "none",
                          outline: isFloorHighlighted && !isActive ? `2px solid ${floorColor3d}` : "none",
                          outlineOffset: "2px",
                          transition: "opacity 0.3s, filter 0.3s",
                        } as React.CSSProperties}>
                        <button
                          className={styles.floorSlabBtn}
                          id={`floor3d-${floor}`}
                          onClick={() => {
                            // Whoosh — same for open and close
                            playWhoosh();
                            setActiveFloor(isActive ? null : floor);
                          }}
                        >
                          <div className={styles.floorSlabSide} />
                          <div className={styles.floorSlabTop} />
                          <div className={styles.floorSlabFront}>
                            <div className={styles.floorSlabLabel}>
                              <span className={styles.floorSlabNum}>FL {floor}</span>
                              {all.pendingRent && <span className={styles.floorPendingDot}>⚠️</span>}
                            </div>
                            <div className={styles.floorWindows}>
                              {allBeds.slice(0, 10).map((bed, i) => (
                                <div key={i} className={`${styles.window} ${
                                  bed.isOccupied
                                    ? (bed.tenant?.rent?.status === "pending" ? styles.windowOrange : styles.windowRed)
                                    : styles.windowGreen
                                }`} />
                              ))}
                            </div>
                            <div className={styles.floorSlabMeta}>
                              {all.free === 0 ? "FULL" : `${all.free} free`}
                            </div>
                          </div>
                          {isActive && <div className={styles.floorSlabGlow} />}
                        </button>

                        {isActive && (
                          <div className={styles.rooms3dGrid}>
                            {all.rooms.length === 0 ? (
                              <p className={styles.noRoomsNote}>No rooms on this floor.</p>
                            ) : all.rooms.map((room) => {
                              const isDimmed = filterType && room.sharingType !== filterType;
                              const roomFree = room.beds.filter(b => !b.isOccupied).length;
                              const hasPending = roomHasPendingRent(room);
                              return (
                                <button key={room.id}
                                  className={`${styles.roomCard3d} ${isDimmed ? styles.roomCard3dDimmed : ""}`}
                                  onClick={() => {
                                    if (isDimmed) return;
                                    playWhoosh(true);
                                    setSelectedRoom(room);
                                  }}
                                  id={`room3d-${room.id}`}
                                >
                                  <div className={styles.roomCard3dHeader}>
                                    <span className={styles.roomCard3dName}>{room.roomNumber}</span>
                                    {hasPending && <span className={styles.roomRentDot}>⚠️</span>}
                                  </div>
                                  <div className={styles.roomBedDots3d}>
                                    {room.beds.map(bed => (
                                      <span key={bed.id} className={`${styles.bedDot3d} ${bed.isOccupied
                                        ? (bed.tenant?.rent?.status === "pending" ? styles.bedDotOrange : styles.bedDotRed)
                                        : styles.bedDotGreen}`} />
                                    ))}
                                  </div>
                                  <span className={styles.roomCard3dSub}>
                                    {roomFree === 0 ? "Full" : `${roomFree} free`}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className={styles.entrance3d}>
                  <div className={styles.entranceDoor} />
                  <span className={styles.entranceLabel}>ENTRANCE</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ─── Room Bottom Sheet ─── */}
      {selectedRoom && !detailTenant && (
        <>
          <div className={styles.backdrop} onClick={() => { playWhoosh(true); setSelectedRoom(null); }} />
          <div className={styles.sheet}>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeader}>
              <div>
                <p className={styles.sheetFloor}>Floor {selectedRoom.floor}</p>
                <h3 className={styles.sheetTitle}>🚪 Room {selectedRoom.roomNumber}</h3>
                <p className={styles.sheetSub}>{selectedRoom.sharingType}-Sharing · {selectedRoom.beds.length} Beds</p>
              </div>
              <button className={styles.sheetClose} onClick={() => { playWhoosh(true); setSelectedRoom(null); }}>✕</button>
            </div>

            <div className={styles.bedsList}>
              {selectedRoom.beds.map((bed) => {
                const letter = BED_LETTERS[bed.bedNumber - 1] || String(bed.bedNumber);
                const isPending = bed.tenant?.rent?.status === "pending";
                return (
                  <div key={bed.id} className={`${styles.bedRow} ${bed.isOccupied ? styles.bedRowOccupied : styles.bedRowFree}`}>
                    <div className={`${styles.bedBadge} ${bed.isOccupied ? (isPending ? styles.bedBadgeOrange : styles.bedBadgeRed) : styles.bedBadgeGreen}`}>
                      Bed {letter}
                    </div>
                    <div className={styles.bedContent}>
                      {bed.isOccupied && bed.tenant ? (
                        <>
                          <p className={styles.tenantName}>👤 {bed.tenant.name}</p>
                          <p className={styles.tenantPhone}>📞 {bed.tenant.phone}</p>
                          {isPending && (
                            <p className={styles.rentPendingTag}>⚠️ Rent pending · {data.currentMonth && monthLabel(data.currentMonth)}</p>
                          )}
                          {bed.tenant.rent?.status === "paid" && (
                            <p className={styles.rentPaidTag}>✅ Rent paid</p>
                          )}
                        </>
                      ) : (
                        <><p className={styles.emptyBedLabel}>🌟 EMPTY BED</p><p className={styles.emptyBedSub}>Ready for a new tenant</p></>
                      )}
                    </div>
                    <div className={styles.bedActionGroup}>
                      {bed.isOccupied && bed.tenant ? (
                        <>
                          {/* Top row: pencil icon + Details side by side */}
                          <div className={styles.bedActionTopRow}>
                            <button
                              className={styles.editContactBtn}
                              title="Edit contact details"
                              id={`edit-${bed.id}`}
                              onClick={() => {
                                const t = bed.tenant!;
                                setEditModal({
                                  tenantId: t.id, name: t.name,
                                  phone: t.phone || "",
                                  altPhone: t.altPhone || "",
                                  emergencyContact: t.emergencyContact || "",
                                  emergencyRelation: t.emergencyRelation || "",
                                  idPhotoUrl: t.idPhotoUrl || null,
                                });
                                setEditError("");
                              }}
                            >✏️</button>
                            <button className={styles.detailsBtn}
                              onClick={() => router.push(`/tenants/profile?id=${bed.tenant!.id}`)}
                              id={`details-${bed.id}`}>Details</button>
                          </div>
                          <button className={styles.moveBtn}
                            onClick={() => {
                              setMovingTenant({ tenant: bed.tenant!, bed, room: selectedRoom });
                              setMoveFloor(null); setMoveTargetRoom(null); setMoveTargetBed(null); setMoveFilterType(null);
                            }}
                            id={`move-${bed.id}`}>🔁 Move</button>
                          <button className={styles.checkoutBtn}
                            onClick={() => openCheckout(bed, selectedRoom)}
                            id={`checkout-${bed.id}`}>
                            Check Out
                          </button>
                        </>
                      ) : (
                        <button className={styles.checkInBtn}
                          onClick={() => router.push(`/tenants/add?bedId=${bed.id}&roomId=${selectedRoom.id}`)}
                          id={`checkin-${bed.id}`}>+ Check In</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.roomHistoryLinkRow}>
              <button className={styles.roomHistoryLink}
                onClick={() => loadRoomHistory(selectedRoom)}
                id="btn-room-history">📜 View Room History</button>
            </div>
          </div>
        </>
      )}


      {/* ─── Tenant Details Overlay ─── */}
      {detailTenant && (
        <>
          <div className={styles.backdrop} onClick={() => setDetailTenant(null)} />
          <div className={styles.detailSheet}>
            <div className={styles.sheetHandle} />

            {/* Detail header */}
            <div className={styles.detailHeader}>
              <button className={styles.detailBack} onClick={() => setDetailTenant(null)}>← Back</button>
              <button className={styles.sheetClose} onClick={() => { setDetailTenant(null); setSelectedRoom(null); }}>✕</button>
            </div>

            {/* Selfie photo */}
            {detailTenant.tenant.photoUrl ? (
              <div className={styles.tenantPhotoWrap}>
                <img src={detailTenant.tenant.photoUrl} alt={detailTenant.tenant.name} className={styles.tenantPhoto} />
              </div>
            ) : (
              <div className={styles.tenantPhotoPlaceholder}>
                <span>👤</span>
              </div>
            )}

            {/* Name + phone */}
            <div className={styles.detailBody}>
              <h2 className={styles.detailName}>{detailTenant.tenant.name}</h2>
              <p className={styles.detailPhone}>📞 +91 {detailTenant.tenant.phone}</p>
              {detailTenant.tenant.altPhone && (
                <p className={styles.detailPhone} style={{ fontSize: 13, opacity: 0.7 }}>📞 Alt: +91 {detailTenant.tenant.altPhone}</p>
              )}
              {detailTenant.tenant.emergencyContact && (
                <p className={styles.detailPhone} style={{ fontSize: 13, color: "#f4a261" }}>
                  🆘 +91 {detailTenant.tenant.emergencyContact}
                  {detailTenant.tenant.emergencyRelation && (
                    <span style={{ marginLeft: 6, fontSize: 11, background: "rgba(244,162,97,0.15)", border: "1px solid rgba(244,162,97,0.3)", borderRadius: 10, padding: "2px 7px" }}>
                      {detailTenant.tenant.emergencyRelation}
                    </span>
                  )}
                </p>
              )}

              {/* Room info */}
              <div className={styles.detailInfoRow}>
                <div className={styles.detailInfoItem}>
                  <span className={styles.detailInfoLabel}>Room</span>
                  <span className={styles.detailInfoValue}>
                    {detailTenant.room.roomNumber} · Bed {detailTenant.bed.bedNumber}
                  </span>
                </div>
                <div className={styles.detailInfoItem}>
                  <span className={styles.detailInfoLabel}>Floor</span>
                  <span className={styles.detailInfoValue}>{detailTenant.room.floor}</span>
                </div>
                <div className={styles.detailInfoItem}>
                  <span className={styles.detailInfoLabel}>Sharing</span>
                  <span className={styles.detailInfoValue}>{detailTenant.room.sharingType}-Bed</span>
                </div>
              </div>

              <div className={styles.detailInfoRow}>
                <div className={styles.detailInfoItem}>
                  <span className={styles.detailInfoLabel}>Joined</span>
                  <span className={styles.detailInfoValue}>
                    {new Date(detailTenant.tenant.joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
                <div className={styles.detailInfoItem}>
                  <span className={styles.detailInfoLabel}>Monthly Rent</span>
                  <span className={styles.detailInfoValue}>
                    {detailTenant.tenant.rentAmount
                      ? `₹${detailTenant.tenant.rentAmount.toLocaleString()}`
                      : "—"}
                  </span>
                </div>
                <div className={styles.detailInfoItem}>
                  <span className={styles.detailInfoLabel}>Deposit</span>
                  <span className={styles.detailInfoValue}>
                    {detailTenant.tenant.advanceAmount
                      ? `₹${detailTenant.tenant.advanceAmount.toLocaleString()}`
                      : "—"}
                  </span>
                </div>
              </div>

              {/* ─── Rent Status ─── */}
              <div className={styles.detailDivider} />
              <p className={styles.detailSectionLabel}>
                📅 {data.currentMonth && monthLabel(data.currentMonth)} RENT
              </p>

              {detailTenant.tenant.rent?.status === "paid" ? (
                <div className={styles.rentPaidCard}>
                  <span>✅ PAID</span>
                  <span>₹{detailTenant.tenant.rent.amount?.toLocaleString()}</span>
                  <span style={{ textTransform: "uppercase", fontSize: 11 }}>{detailTenant.tenant.rent.paymentMode || ""}</span>
                </div>
              ) : (
                <>
                  <div className={styles.rentPendingCard}>
                    <span>⚠️ RENT PENDING</span>
                    <span>₹{(detailTenant.tenant.rentAmount || 0).toLocaleString()} / month</span>
                  </div>
                  {detailTenant.tenant.rent && (
                    <>
                      <p className={styles.paymentLabel}>Amount received</p>
                      <div className={styles.rentAmountRow}>
                        <span className={styles.rentAmountPrefix}>₹</span>
                        <input
                          type="number"
                          className={styles.rentAmountInput}
                          placeholder={`Full: ${(detailTenant.tenant.rentAmount || 0).toLocaleString()}`}
                          value={rentPayAmount}
                          onChange={(e) => setRentPayAmount(e.target.value)}
                          inputMode="numeric"
                          id="input-rent-pay-amount"
                        />
                      </div>
                      <p className={styles.paymentLabel} style={{ marginTop: 10 }}>Payment received via</p>
                      <div className={styles.paymentRow}>
                        <button className={`${styles.payBtn} ${rentPayMode === "cash" ? styles.payBtnActive : ""}`}
                          onClick={() => setRentPayMode("cash")}>💵 CASH</button>
                        <button className={`${styles.payBtn} ${rentPayMode === "upi" ? styles.payBtnActive : ""}`}
                          onClick={() => setRentPayMode("upi")}>📱 UPI</button>
                      </div>
                      <button className={styles.markPaidBtn}
                        onClick={() => handleMarkPaid(detailTenant.tenant.rent!.id, detailTenant.tenant.rentAmount || 0)}
                        disabled={markingPaid === detailTenant.tenant.rent.id || (() => {
                          const raw = rentPayAmount.trim();
                          if (!raw) return false; // blank = full amount, always OK
                          const n = Number(raw);
                          const full = detailTenant.tenant.rentAmount || 0;
                          return !Number.isFinite(n) || n <= 0 || !Number.isInteger(n) || n > full;
                        })()}
                        id="btn-mark-paid">
                        {markingPaid === detailTenant.tenant.rent.id
                          ? <><span className={styles.spinnerDark} /> Marking…</>
                          : (() => {
                              const raw = rentPayAmount.trim();
                              const display = raw === "" ? (detailTenant.tenant.rentAmount || 0) : (Number.isFinite(Number(raw)) ? Number(raw) : 0);
                              return `💵 MARK AS PAID · ₹${Math.max(0, display).toLocaleString("en-IN")}`;
                            })()}
                      </button>
                    </>
                  )}
                </>
              )}

              {/* ID Card photo */}
              {detailTenant.tenant.idPhotoUrl && (
                <>
                  <div className={styles.detailDivider} />
                  <p className={styles.detailSectionLabel}>🪪 ID CARD</p>
                  <img src={detailTenant.tenant.idPhotoUrl} alt="ID Card" className={styles.idCardThumb} />
                </>
              )}

              {/* Checkout */}
              <div className={styles.detailDivider} />
              <button className={styles.checkoutBtnFull}
                onClick={() => openCheckout(detailTenant.bed, detailTenant.room)}
                disabled={checkingOut} id="btn-checkout-detail">
                🚪 Check Out Tenant
              </button>
            </div>
          </div>
        </>
      )}
      {/* ─── Move Tenant Overlay ─── */}
      {movingTenant && (
        <>
          <div className={styles.backdrop} onClick={() => { setMovingTenant(null); setMoveTargetBed(null); setMoveTargetRoom(null); }} />
          <div className={styles.moveSheet}>
            <div className={styles.sheetHandle} />

            {/* Move header */}
            <div className={styles.moveHeader}>
              <button className={styles.detailBack} onClick={() => {
                if (moveTargetBed) { setMoveTargetBed(null); setMoveTargetRoom(null); }
                else setMovingTenant(null);
              }}>← Back</button>
              <span className={styles.moveTitle}>🔁 MOVE TENANT</span>
              <button className={styles.sheetClose} onClick={() => setMovingTenant(null)}>✕</button>
            </div>

            {/* Who is moving */}
            <div className={styles.moveBanner}>
              <p className={styles.moveBannerName}>{movingTenant.tenant.name}</p>
              <p className={styles.moveBannerFrom}>
                From: Room {movingTenant.room.roomNumber} · Bed {BED_LETTERS[movingTenant.bed.bedNumber - 1]} · Floor {movingTenant.room.floor}
              </p>
            </div>

            {/* ─── Step 1: Pick target bed ─── */}
            {!moveTargetBed && (
              <div className={styles.moveBody}>
                {/* Sharing type filter */}
                {activeShareTypes.length > 1 && (
                  <div className={styles.moveFilterRow}>
                    <button className={`${styles.moveFilterChip} ${moveFilterType === null ? styles.moveFilterChipActive : ""}`}
                      onClick={() => { setMoveFilterType(null); setMoveFloor(null); }}>All</button>
                    {activeShareTypes.map(t => (
                      <button key={t}
                        className={`${styles.moveFilterChip} ${moveFilterType === t ? styles.moveFilterChipActive : ""}`}
                        onClick={() => { setMoveFilterType(t); setMoveFloor(null); }}>
                        {t}-Share
                      </button>
                    ))}
                  </div>
                )}

                <p className={styles.moveSectionLabel}>SELECT AN EMPTY BED</p>

                {/* Floors with empty beds */}
                {floorNums.map(floor => {
                  const floorRooms = (data?.rooms ?? []).filter(r => {
                    if (r.floor !== floor) return false;
                    if (moveFilterType && r.sharingType !== moveFilterType) return false;
                    // Has empty beds and it's not the current bed's room (can still move within same floor)
                    return r.beds.some(b => !b.isOccupied);
                  });
                  if (floorRooms.length === 0) return null;
                  const totalEmpty = floorRooms.reduce((s, r) => s + r.beds.filter(b => !b.isOccupied).length, 0);
                  const isOpen = moveFloor === floor;
                  return (
                    <div key={floor} className={styles.moveFloorWrap}>
                      <button className={`${styles.moveFloorBtn} ${isOpen ? styles.moveFloorBtnOpen : ""}`}
                        onClick={() => setMoveFloor(isOpen ? null : floor)}>
                        <div className={styles.moveFloorLeft}>
                          <span className={styles.moveFloorLabel}>Floor {floor}</span>
                          <span className={styles.moveFloorMeta}>🟢 {totalEmpty} empty bed{totalEmpty > 1 ? "s" : ""}</span>
                        </div>
                        <span className={`${styles.floorChevron} ${isOpen ? styles.floorChevronUp : ""}`}>›</span>
                      </button>

                      {isOpen && (
                        <div className={styles.moveRoomGrid}>
                          {floorRooms.map(room => {
                            const emptyBeds = room.beds.filter(b => !b.isOccupied);
                            return (
                              <div key={room.id} className={styles.moveRoomCard}>
                                <p className={styles.moveRoomName}>{room.roomNumber}</p>
                                <p className={styles.moveRoomSub}>{room.sharingType}-Sharing</p>
                                <div className={styles.moveBedRow}>
                                  {room.beds.map(bed => (
                                    <button key={bed.id}
                                      disabled={bed.isOccupied}
                                      className={`${styles.moveBedBtn} ${bed.isOccupied ? styles.moveBedBtnOcc : styles.moveBedBtnFree}`}
                                      onClick={() => { setMoveTargetRoom(room); setMoveTargetBed(bed); }}
                                      id={`moveto-${bed.id}`}>
                                      {BED_LETTERS[bed.bedNumber - 1]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {(data?.rooms ?? []).every(r =>
                  !r.beds.some(b => !b.isOccupied && b.id !== movingTenant.bed.id)
                ) && (
                  <p className={styles.moveNoEmpty}>No empty beds available in the PG right now.</p>
                )}
              </div>
            )}

            {/* ─── Step 2: Confirm ─── */}
            {moveTargetBed && moveTargetRoom && (
              <div className={styles.moveConfirmBody}>
                <div className={styles.moveConfirmCard}>
                  <div className={styles.moveConfirmRow}>
                    <span className={styles.moveConfirmLabel}>FROM</span>
                    <span className={styles.moveConfirmValue}>
                      Room {movingTenant.room.roomNumber} · Bed {BED_LETTERS[movingTenant.bed.bedNumber - 1]} · Floor {movingTenant.room.floor}
                    </span>
                  </div>
                  <div className={styles.moveArrow}>↓</div>
                  <div className={styles.moveConfirmRow}>
                    <span className={styles.moveConfirmLabel}>TO</span>
                    <span className={styles.moveConfirmValue} style={{ color: "var(--brand-green)" }}>
                      Room {moveTargetRoom.roomNumber} · Bed {BED_LETTERS[moveTargetBed.bedNumber - 1]} · Floor {moveTargetRoom.floor}
                    </span>
                  </div>
                </div>

                <p className={styles.moveConfirmNote}>
                  This move is recorded in {movingTenant.tenant.name}&apos;s history. No data is lost.
                </p>

                <button className={styles.confirmMoveBtn}
                  onClick={() => handleMove(movingTenant.tenant.id, moveTargetBed.id)}
                  disabled={moveInProgress} id="btn-confirm-move">
                  {moveInProgress
                    ? <><span className={styles.spinnerDark} /> Moving…</>
                    : `🎉 CONFIRM TRANSFER`}
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {/* ─── Checkout Modal ─── */}
      {checkoutModal && (
        <>
          <div className={styles.backdrop} onClick={() => setCheckoutModal(null)} />
          <div className={styles.checkoutSheet}>
            <div className={styles.sheetHandle} />
            <div className={styles.checkoutHeader}>
              <span className={styles.checkoutHeaderTitle}>🚪 TENANT CHECK-OUT</span>
              <button className={styles.sheetClose} onClick={() => setCheckoutModal(null)}>✕</button>
            </div>

            <div className={styles.checkoutBody}>
              <p className={styles.checkoutTenantName}>{checkoutModal.tenant.name}</p>
              <p className={styles.checkoutTenantRoom}>
                Room {checkoutModal.room.roomNumber} · Bed {BED_LETTERS[checkoutModal.bed.bedNumber - 1]} · Floor {checkoutModal.room.floor}
              </p>

              <div className={styles.depositCard}>
                <p className={styles.depositTitle}>💰 DEPOSIT CLOSURE</p>
                <div className={styles.depositRow}>
                  <span className={styles.depositLabel}>Initial Deposit</span>
                  <span className={styles.depositValue}>₹{(checkoutModal.tenant.advanceAmount || 0).toLocaleString()}</span>
                </div>
                <div className={styles.depositRow}>
                  <span className={styles.depositLabel}>Deductions (Damage/Bills)</span>
                  <div className={styles.deductionInput}>
                    <span className={styles.rupeePrefix}>₹</span>
                    <input type="number" className={styles.deductionField}
                      placeholder="0" value={deduction} min="0"
                      max={checkoutModal.tenant.advanceAmount || 0}
                      onChange={(e) => setDeduction(e.target.value)}
                      inputMode="numeric" id="input-deduction" />
                  </div>
                </div>
                {/* Real-time deduction validation error */}
                {(() => {
                  const raw = deduction.trim();
                  if (!raw) return null;
                  const dep = Number(raw);
                  const deposit = checkoutModal.tenant.advanceAmount || 0;
                  if (dep < 0) return (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#e63946", fontWeight: 600 }}>
                      ⚠️ Deduction cannot be negative
                    </p>
                  );
                  if (!Number.isInteger(dep)) return (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#e63946", fontWeight: 600 }}>
                      ⚠️ Please enter a whole rupee amount (no paise/decimals)
                    </p>
                  );
                  if (dep > deposit) return (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#e63946", fontWeight: 600 }}>
                      ⚠️ Deduction (₹{dep.toLocaleString("en-IN")}) cannot exceed the initial deposit (₹{deposit.toLocaleString("en-IN")})
                    </p>
                  );
                  return null;
                })()}
                <div className={styles.depositDivider} />
                <div className={`${styles.depositRow} ${styles.depositRefundRow}`}>
                  <span className={styles.depositLabel}>Final Refund to Tenant</span>
                  <span className={styles.depositRefundAmount}>
                    ₹{Math.max(0, (checkoutModal.tenant.advanceAmount || 0) - (Number.isInteger(Number(deduction)) ? Number(deduction) : 0)).toLocaleString()}
                  </span>
                </div>
              </div>

              <p className={styles.paymentLabel}>💳 REFUND MODE</p>
              <div className={styles.paymentRow}>
                <button className={`${styles.payBtn} ${checkoutRefundMode === "cash" ? styles.payBtnActive : ""}`}
                  onClick={() => setCheckoutRefundMode("cash")}>💵 CASH</button>
                <button className={`${styles.payBtn} ${checkoutRefundMode === "upi" ? styles.payBtnActive : ""}`}
                  onClick={() => setCheckoutRefundMode("upi")}>📱 UPI</button>
              </div>

              {/* Outstanding rent warning */}
              {(() => {
                const rent = checkoutModal.tenant.rent;
                const outstanding = rent ? Math.max(0, rent.amount - (rent.paidAmount ?? 0)) : 0;
                if (outstanding <= 0) return null;
                return (
                  <div style={{
                    background: "rgba(230,57,70,0.12)",
                    border: "1px solid rgba(230,57,70,0.35)",
                    borderRadius: 10, padding: "10px 14px", marginBottom: 14,
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e63946" }}>
                      ⚠️ Outstanding Rent: ₹{outstanding.toLocaleString("en-IN")}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                      Please clear the outstanding rent of ₹{outstanding.toLocaleString("en-IN")} before checkout.
                    </p>
                  </div>
                );
              })()}

              <button className={styles.permanentExitBtn}
                onClick={handleCheckout}
                disabled={checkingOut || (() => {
                  const raw = deduction.trim();
                  const dep = raw === "" ? 0 : Number(raw);
                  const deposit = checkoutModal.tenant.advanceAmount || 0;
                  if (dep < 0 || !Number.isInteger(dep) || dep > deposit) return true;
                  const rent = checkoutModal.tenant.rent;
                  const outstanding = rent ? Math.max(0, rent.amount - (rent.paidAmount ?? 0)) : 0;
                  return outstanding > 0;
                })()}
                id="btn-permanent-exit">
                {checkingOut
                  ? <><span className={styles.spinnerDark} /> Processing…</>
                  : "🚨 PERMANENT EXIT"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Edit Contact Modal ─── */}
      {editModal && (
        <>
          <div className={styles.backdrop} onClick={() => setEditModal(null)} />
          <div className={styles.checkoutSheet}>
            <div className={styles.sheetHandle} />
            <div className={styles.checkoutHeader}>
              <span className={styles.checkoutHeaderTitle}>✏️ EDIT CONTACT — {editModal.name}</span>
              <button className={styles.sheetClose} onClick={() => setEditModal(null)}>✕</button>
            </div>

            <div className={styles.checkoutBody} style={{ gap: 14 }}>

              {/* Mobile Number */}
              <div>
                <p className={styles.paymentLabel}>📞 Mobile Number</p>
                <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden" }}>
                  <span style={{ padding: "0 10px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>+91</span>
                  <input
                    type="tel" inputMode="numeric" maxLength={10}
                    value={editModal.phone}
                    onChange={(e) => setEditModal({ ...editModal, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="10-digit mobile"
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 14, fontWeight: 600, padding: "11px 10px 11px 0", fontFamily: "inherit" }}
                    id="edit-phone"
                  />
                </div>
              </div>

              {/* Alt Number */}
              <div>
                <p className={styles.paymentLabel}>📞 Alternative Number <span style={{ opacity: 0.45, fontWeight: 500 }}>(optional)</span></p>
                <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden" }}>
                  <span style={{ padding: "0 10px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>+91</span>
                  <input
                    type="tel" inputMode="numeric" maxLength={10}
                    value={editModal.altPhone}
                    onChange={(e) => setEditModal({ ...editModal, altPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="Alt. number"
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 14, fontWeight: 600, padding: "11px 10px 11px 0", fontFamily: "inherit" }}
                    id="edit-alt-phone"
                  />
                </div>
              </div>

              {/* Emergency Contact */}
              <div>
                <p className={styles.paymentLabel}>🆘 Emergency Contact <span style={{ opacity: 0.45, fontWeight: 500 }}>(optional)</span></p>
                <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden" }}>
                  <span style={{ padding: "0 10px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>+91</span>
                  <input
                    type="tel" inputMode="numeric" maxLength={10}
                    value={editModal.emergencyContact}
                    onChange={(e) => setEditModal({ ...editModal, emergencyContact: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="Emergency number"
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 14, fontWeight: 600, padding: "11px 10px 11px 0", fontFamily: "inherit" }}
                    id="edit-emergency"
                  />
                </div>
                {/* Relation tags */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {["Father","Mother","Sibling","Friend","Other"].map((rel) => (
                    <button key={rel}
                      onClick={() => setEditModal({ ...editModal, emergencyRelation: editModal.emergencyRelation === rel ? "" : rel })}
                      style={{
                        padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        background: editModal.emergencyRelation === rel ? "rgba(45,198,83,0.15)" : "rgba(255,255,255,0.05)",
                        border: `1.5px solid ${editModal.emergencyRelation === rel ? "rgba(45,198,83,0.4)" : "rgba(255,255,255,0.1)"}`,
                        color: editModal.emergencyRelation === rel ? "#2dc653" : "rgba(255,255,255,0.55)",
                      }}
                    >{rel}</button>
                  ))}
                </div>
              </div>

              {/* ID Card */}
              <div>
                <p className={styles.paymentLabel}>🪪 ID Card</p>
                {editModal.idPhotoUrl && (
                  <img src={editModal.idPhotoUrl} alt="ID Card" style={{ width: "100%", borderRadius: 10, marginBottom: 8, maxHeight: 160, objectFit: "cover" }} />
                )}
                <button
                  onClick={() => editIdCardRef.current?.click()}
                  disabled={editUploading}
                  style={{
                    width: "100%", padding: "11px", border: "1.5px dashed rgba(255,255,255,0.18)", borderRadius: 10,
                    background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", fontSize: 13,
                    fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                  id="btn-edit-id-card"
                >
                  {editUploading ? "Uploading…" : editModal.idPhotoUrl ? "🔄 Change ID Card" : "📷 Upload ID Card"}
                </button>
                <input
                  ref={editIdCardRef} type="file" accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setEditUploading(true);
                    try {
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const base64 = ev.target?.result as string;
                        const upRes = await fetch(`${API_URL}/api/upload`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...authHeader() },
                          body: JSON.stringify({ base64, fileName: `id-${editModal.tenantId}.jpg` }),
                        });
                        const upJson = await upRes.json();
                        if (upRes.ok) setEditModal({ ...editModal, idPhotoUrl: upJson.url });
                        else setEditError(upJson.error || "Upload failed");
                        setEditUploading(false);
                      };
                      reader.readAsDataURL(file);
                    } catch { setEditUploading(false); setEditError("Upload failed"); }
                  }}
                />
              </div>

              {editError && <p style={{ margin: 0, fontSize: 12, color: "#e63946", fontWeight: 600 }}>⚠️ {editError}</p>}

              <button
                onClick={async () => {
                  if (!editModal) return;
                  setEditError("");
                  if (editModal.phone.length !== 10) { setEditError("Mobile number must be 10 digits"); return; }
                  if (editModal.altPhone && editModal.altPhone.length !== 10) { setEditError("Alternative number must be 10 digits"); return; }
                  if (editModal.emergencyContact && editModal.emergencyContact.length !== 10) { setEditError("Emergency contact must be 10 digits"); return; }
                  setEditSaving(true);
                  try {
                    const res = await fetch(`${API_URL}/api/tenants/${editModal.tenantId}/contact`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", ...authHeader() },
                      body: JSON.stringify({
                        phone: editModal.phone,
                        altPhone: editModal.altPhone || null,
                        emergencyContact: editModal.emergencyContact || null,
                        emergencyRelation: editModal.emergencyRelation || null,
                        idPhotoUrl: editModal.idPhotoUrl,
                      }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json.error || `Server error (${res.status})`);
                    setEditModal(null);
                    await load();
                  } catch (err) {
                    setEditError(err instanceof Error ? err.message : "Save failed");
                  } finally { setEditSaving(false); }
                }}
                disabled={editSaving || editUploading}
                style={{
                  width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg, #2dc653, #1a9e3d)",
                  color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  opacity: (editSaving || editUploading) ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                id="btn-save-contact"
              >
                {editSaving ? <><span className={styles.spinnerDark} /> Saving…</> : "✅ SAVE CHANGES"}
              </button>

            </div>
          </div>
        </>
      )}

      {/* ─── Search Overlay ─── */}
      {searchOpen && (
        <>
          <div className={styles.backdrop} onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }} />
          <div className={styles.searchSheet}>
            <div className={styles.sheetHandle} />
            <div className={styles.searchHeader}>
              <span className={styles.searchTitle}>🔍 TENANT SEARCH</span>
              <button className={styles.sheetClose} onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}>✕</button>
            </div>
            <div className={styles.searchInputWrap}>
              <span className={styles.searchIcon}>🔍</span>
              <input type="text" className={styles.searchInput}
                placeholder="Name or phone number…"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                autoFocus id="input-search" />
            </div>
            <div className={styles.searchResults}>
              {searching && <div className={styles.searchLoading}><span className={styles.spinner} /></div>}
              {!searching && searchResults.length === 0 && searchQuery.trim() && (
                <p className={styles.searchEmpty}>No tenants found for &ldquo;{searchQuery}&rdquo;</p>
              )}
              {searchResults.map((t) => {
                // Find bed+room for this tenant so we can open Details
                const tenantBed = data?.rooms.flatMap(r => r.beds.map(b => ({ bed: b, room: r }))).find(x => x.bed.tenant?.id === t.id);
                return (
                <div
                  key={t.id}
                  className={styles.searchCard}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    router.push(`/tenants/profile?id=${t.id}`);
                    setSearchOpen(false); setSearchQuery(""); setSearchResults([]);
                  }}
                >
                  <div className={styles.searchCardTop}>
                    {t.photoUrl
                      ? <img src={t.photoUrl} alt={t.name} className={styles.searchAvatar} />
                      : <div className={styles.searchAvatarPlaceholder}>👤</div>}
                    <div className={styles.searchCardInfo}>
                      <p className={styles.searchCardName}>{t.name}</p>
                      <p className={styles.searchCardPhone}>📞 {t.phone}</p>
                      <span className={`${styles.searchCardStatus} ${t.status === "active" ? styles.searchStatusActive : styles.searchStatusInactive}`}>
                        {t.status === "active" ? "● ACTIVE" : "● CHECKED OUT"}
                      </span>
                    </div>
                  </div>
                  {/* Timeline */}
                  {t.history.length > 0 && (
                    <div className={styles.searchTimeline}>
                      {t.history.map((h) => (
                        <div key={h.id} className={styles.timelineEvent}>
                          <div className={`${styles.timelineDot} ${h.eventType === "check_out" ? styles.dotRed : h.eventType === "move" ? styles.dotPurple : styles.dotGreen}`} />
                          <div className={styles.timelineText}>
                            <span className={styles.timelineType}>
                              {h.eventType === "check_in" ? "✅ Checked In" : h.eventType === "move" ? "🔁 Moved" : "🚪 Checked Out"}
                            </span>
                            <span className={styles.timelineNote}>{h.note || (h.toRoom || h.fromRoom || "")}</span>
                            <span className={styles.timelineDate}>
                              {new Date(h.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {t.joiningDate && (
                    <p className={styles.searchJoined}>
                      Joined: {new Date(t.joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      {t.leavingDate && ` · Left: ${new Date(t.leavingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
                    </p>
                  )}
                  {tenantBed && <p style={{ fontSize: 11, color: "var(--brand-green)", marginTop: 4 }}>Tap to view full profile →</p>}
                </div>
              );
              })}
            </div>
          </div>
        </>
      )}

      {/* ─── Room History Overlay ─── */}
      {roomHistoryRoom && (
        <>
          <div className={styles.backdrop} onClick={() => { setRoomHistoryRoom(null); setRoomHistoryData(null); }} />
          <div className={styles.roomHistorySheet}>
            <div className={styles.sheetHandle} />
            <div className={styles.checkoutHeader}>
              <span className={styles.checkoutHeaderTitle}>📜 PAST TENANTS · Room {roomHistoryRoom.roomNumber}</span>
              <button className={styles.sheetClose} onClick={() => { setRoomHistoryRoom(null); setRoomHistoryData(null); }}>✕</button>
            </div>
            <div className={styles.checkoutBody}>
              {loadingRoomHistory && <div className={styles.searchLoading}><span className={styles.spinner} /></div>}
              {!loadingRoomHistory && roomHistoryData && roomHistoryData.past.length === 0 && (
                <p className={styles.searchEmpty}>No past tenants for this room yet.</p>
              )}
              {!loadingRoomHistory && roomHistoryData?.past.map((t) => (
                <div key={t.id} className={styles.historyTenantRow}>
                  <div className={styles.historyAvatarWrap}>
                    {t.photoUrl
                      ? <img src={t.photoUrl} alt={t.name} className={styles.historyAvatar} />
                      : <div className={styles.historyAvatarPlaceholder}>👤</div>}
                  </div>
                  <div className={styles.historyTenantInfo}>
                    <p className={styles.historyTenantName}>{t.name}</p>
                    <p className={styles.historyTenantPhone}>📞 {t.phone}</p>
                    <p className={styles.historyTenantDates}>
                      {t.joiningDate && new Date(t.joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      {" ➔ "}
                      {t.leavingDate ? new Date(t.leavingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Present"}
                    </p>
                    {typeof t.advanceAmount === "number" && t.advanceAmount > 0 && (
                      <p className={styles.historyDeposit}>
                        Deposit: ₹{t.advanceAmount.toLocaleString()}
                        {typeof t.depositDeduction === "number" && t.depositDeduction > 0
                          ? ` · Deducted: ₹${t.depositDeduction.toLocaleString()} · Refund: ₹${Math.max(0, t.advanceAmount - t.depositDeduction).toLocaleString()}`
                          : " · Fully refunded"}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── Search FAB ─── */}
      {!searchOpen && !checkoutModal && !roomHistoryRoom && (
        <button className={styles.searchFab} onClick={() => setSearchOpen(true)} id="btn-search-fab">
          🔍
        </button>
      )}
    </main>
  );
}
