"use client";
import AppLogo from "@/components/AppLogo";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "../../add-pg/building/page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  sharingType: number;
}

interface BedDetail {
  id: string;
  bedNumber: number;
  isOccupied: boolean;
}

const PG_TYPE_LABEL: Record<string, string> = {
  gents: "Gents 🚹",
  ladies: "Ladies 🚺",
  "co-living": "Co-Living 🧑‍🤝‍🧑",
};

function EditBuildingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pgId = searchParams.get("pgId");
  const { token, isLoading: authLoading } = useAuth();

  const [pgName, setPgName] = useState("My PG");
  const [pgType, setPgType] = useState("gents");
  const [totalFloors, setTotalFloors] = useState(1);
  const [activeFloor, setActiveFloor] = useState<number | null>(null);
  const [roomsByFloor, setRoomsByFloor] = useState<Record<number, Room[]>>({});
  const [addingRoom, setAddingRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [bedsCount, setBedsCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Bed editor state ─────────────────────
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editingBeds, setEditingBeds] = useState<BedDetail[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(false);
  const [bedOpError, setBedOpError] = useState("");
  // ── Room rename state ─────────────────────
  const [renameRoomId, setRenameRoomId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  // ── Delete room error ────────────────────
  const [deleteRoomError, setDeleteRoomError] = useState<{roomId: string; msg: string} | null>(null);

  const loadRooms = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/rooms?pgId=${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.rooms) {
        const grouped: Record<number, Room[]> = {};
        data.rooms.forEach((room: Room) => {
          if (!grouped[room.floor]) grouped[room.floor] = [];
          grouped[room.floor].push(room);
        });
        setRoomsByFloor(grouped);
      }
    } catch { /* no-op */ }
  }, [token]);

  useEffect(() => {
    if (!pgId || authLoading) return; // wait for auth before fetching

    fetch(`${API_URL}/api/pgs/${pgId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.pg) {
          setPgName(data.pg.name);
          setPgType(data.pg.type);
          setTotalFloors(data.pg.totalFloors);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    loadRooms(pgId);
  }, [pgId, loadRooms, token, authLoading]);

  function openFloor(floor: number) {
    if (activeFloor === floor) {
      setActiveFloor(null); setAddingRoom(false);
      setEditingRoom(null); setEditingBeds([]);
    } else {
      setActiveFloor(floor); setAddingRoom(false);
      setRoomName(""); setBedsCount(1); setSavingError("");
      setEditingRoom(null); setEditingBeds([]);
    }
  }

  async function handleSaveRoom() {
    setSavingError("");
    if (!roomName.trim()) { setSavingError("Enter a room name"); return; }
    if (activeFloor === null || !pgId) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ pgId, roomNumber: roomName.trim(), floor: activeFloor, bedsCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      setRoomsByFloor((prev) => ({
        ...prev,
        [activeFloor]: [...(prev[activeFloor] || []), data.room],
      }));
      setRoomName(""); setBedsCount(1); setAddingRoom(false);
    } catch (err) {
      setSavingError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom(roomId: string, floor: number) {
    setDeleteRoomError(null);
    if (editingRoom?.id === roomId) { setEditingRoom(null); setEditingBeds([]); }
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json();
        // 409 = occupied beds; surface the error on that specific room
        setDeleteRoomError({ roomId, msg: data.error || "Cannot delete room" });
        return;
      }
      setRoomsByFloor((prev) => ({
        ...prev,
        [floor]: (prev[floor] || []).filter((r) => r.id !== roomId),
      }));
    } catch { setDeleteRoomError({ roomId, msg: "Network error. Try again." }); }
  }

  async function handleRenameRoom(room: Room) {
    if (!renameValue.trim() || renameValue.trim() === room.roomNumber) {
      setRenameRoomId(null); setRenameError(""); return;
    }
    setRenameSaving(true); setRenameError("");
    try {
      const res = await fetch(`${API_URL}/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ roomNumber: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setRenameError(data.error || "Failed to rename"); return; }
      // Update local state
      setRoomsByFloor((prev) => ({
        ...prev,
        [room.floor]: (prev[room.floor] || []).map((r) =>
          r.id === room.id ? { ...r, roomNumber: renameValue.trim() } : r
        ),
      }));
      if (editingRoom?.id === room.id) setEditingRoom((r) => r ? { ...r, roomNumber: renameValue.trim() } : r);
      setRenameRoomId(null);
    } catch { setRenameError("Network error. Try again."); }
    finally { setRenameSaving(false); }
  }

  // ── Bed editor functions ──────────────────
  async function openRoomEditor(room: Room) {
    if (editingRoom?.id === room.id) { setEditingRoom(null); setEditingBeds([]); return; }
    setEditingRoom(room);
    setEditingBeds([]);
    setBedOpError("");
    setLoadingBeds(true);
    try {
      // Fetch beds directly from the rooms endpoint (authenticated)
      const res = await fetch(`${API_URL}/api/rooms?pgId=${pgId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      // rooms endpoint returns flat room list; get beds for this room via dashboard
      // Use dashboard which returns beds per room
      const dashRes = await fetch(`${API_URL}/api/dashboard?pgId=${pgId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const dashData = await dashRes.json();
      const found = dashData.rooms?.find((r: { id: string }) => r.id === room.id);
      if (found?.beds) setEditingBeds(found.beds);
    } catch { /* no-op */ }
    finally { setLoadingBeds(false); }
  }

  async function handleAddBed(room: Room) {
    setBedOpError("");
    try {
      const res = await fetch(`${API_URL}/api/rooms/beds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ roomId: room.id }),
      });
      const data = await res.json();
      if (!res.ok) { setBedOpError(data.error || "Failed to add bed"); return; }
      setEditingBeds((prev) => [...prev, { id: data.bed.id, bedNumber: data.bed.bedNumber, isOccupied: false }]);
      setRoomsByFloor((prev) => ({
        ...prev,
        [room.floor]: (prev[room.floor] || []).map((r) =>
          r.id === room.id ? { ...r, sharingType: r.sharingType + 1 } : r
        ),
      }));
      if (editingRoom?.id === room.id) setEditingRoom((r) => r ? { ...r, sharingType: r.sharingType + 1 } : r);
    } catch { setBedOpError("Network error. Try again."); }
  }

  async function handleDeleteBed(bedId: string, room: Room) {
    setBedOpError("");
    const bed = editingBeds.find((b) => b.id === bedId);
    if (bed?.isOccupied) { setBedOpError("This bed has a tenant. Check them out first."); return; }
    try {
      const res = await fetch(`${API_URL}/api/rooms/beds/${bedId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) { setBedOpError(data.error || "Failed to remove bed"); return; }
      setEditingBeds((prev) => prev.filter((b) => b.id !== bedId));
      setRoomsByFloor((prev) => ({
        ...prev,
        [room.floor]: (prev[room.floor] || []).map((r) =>
          r.id === room.id ? { ...r, sharingType: Math.max(0, r.sharingType - 1) } : r
        ),
      }));
      if (editingRoom?.id === room.id) setEditingRoom((r) => r ? { ...r, sharingType: Math.max(0, r.sharingType - 1) } : r);
    } catch { setBedOpError("Network error. Try again."); }
  }

  const totalRooms = Object.values(roomsByFloor).reduce((s, r) => s + r.length, 0);
  const totalBeds = Object.values(roomsByFloor).reduce(
    (s, r) => s + r.reduce((bs, room) => bs + room.sharingType, 0), 0
  );
  const floorNums = Array.from({ length: totalFloors }, (_, i) => totalFloors - i);

  if (loading) {
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
          <button className={styles.backBtn} onClick={() => router.back()} id="btn-back">
            ← Back
          </button>
          <AppLogo />
        </div>

        {/* Building name + stats */}
        <div className={`${styles.buildingHeader} animate-fade-up delay-1`}>
          <div className={styles.buildingTitle}>
            <h2 className={styles.buildingName}>{pgName}</h2>
            <span className={styles.typeBadge}>{PG_TYPE_LABEL[pgType]}</span>
          </div>
          <div className={styles.buildingStats}>
            <div className={styles.stat}>
              <span className={styles.statNum}>{totalFloors}</span>
              <span className={styles.statLabel}>Floors</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statNum}>{totalRooms}</span>
              <span className={styles.statLabel}>Rooms</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statNum}>{totalBeds}</span>
              <span className={styles.statLabel}>Beds</span>
            </div>
          </div>
        </div>

        {/* Building visual */}
        <div className={`${styles.building} animate-fade-up delay-2`}>
          <div className={styles.roofWrap}>
            <div className={styles.roofLeft} />
            <div className={styles.roofMiddle}>🏗️</div>
            <div className={styles.roofRight} />
          </div>

          <div className={styles.floors}>
            {floorNums.map((floor) => {
              const floorRooms = roomsByFloor[floor] || [];
              const isActive = activeFloor === floor;
              const litWindows = Math.min(floorRooms.length, 5);

              return (
                <div key={floor} className={styles.floorWrap}>
                  <button
                    className={`${styles.floorBar} ${isActive ? styles.floorBarActive : ""}`}
                    onClick={() => openFloor(floor)}
                    id={`floor-btn-${floor}`}
                  >
                    <div className={styles.windows}>
                      {[0,1,2,3,4].map((wi) => (
                        <div key={wi} className={`${styles.win} ${wi < litWindows ? styles.winLit : ""}`} />
                      ))}
                    </div>
                    <div className={styles.floorLabel}>
                      <span className={styles.floorNum}>Floor {floor}</span>
                      <span className={styles.floorCount}>
                        {floorRooms.length === 0
                          ? "Tap to add rooms"
                          : `${floorRooms.length} room${floorRooms.length > 1 ? "s" : ""} · ${floorRooms.reduce((s, r) => s + r.sharingType, 0)} beds`}
                      </span>
                    </div>
                    <span className={`${styles.chevron} ${isActive ? styles.chevronUp : ""}`}>›</span>
                  </button>

                  {isActive && (
                    <div className={styles.floorPanel}>
                      {/* Rooms */}
                      {floorRooms.length > 0 && (
                        <div className={styles.roomGrid}>
                          {floorRooms.map((room) => {
                            const isEditing = editingRoom?.id === room.id;
                            const isRenaming = renameRoomId === room.id;
                            return (
                              <div key={room.id} style={{ width: "100%" }}>
                                {/* Room card */}
                                <div
                                  className={`${styles.roomCard} ${isEditing ? styles.roomCardActive : ""}`}
                                  style={{ cursor: "pointer", width: "100%", position: "relative" }}
                                >
                                  {/* ── Pencil (rename) icon ── */}
                                  <button
                                    style={{ position: "absolute", top: 6, left: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.7, zIndex: 2, padding: 2 }}
                                    onClick={(e) => { e.stopPropagation(); setRenameRoomId(room.id); setRenameValue(room.roomNumber); setRenameError(""); }}
                                    title="Rename room"
                                  >✏️</button>

                                  {/* ── Delete room ── */}
                                  <button
                                    className={styles.roomDelete}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id, floor); }}
                                    title="Delete entire room"
                                  >×</button>

                                  {/* ── Clickable body → open bed editor ── */}
                                  <button
                                    style={{ background: "none", border: "none", cursor: "pointer", width: "100%", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                                    onClick={() => openRoomEditor(room)}
                                    id={`room-edit-${room.id}`}
                                    title="Click to edit beds"
                                  >
                                    <span className={styles.roomIcon}>🚪</span>
                                    <span className={styles.roomName}>{room.roomNumber}</span>
                                    <div className={styles.roomBeds}>
                                      {Array.from({ length: Math.min(room.sharingType, 4) }).map((_, i) => (
                                        <span key={i} className={styles.bedIcon}>🛏️</span>
                                      ))}
                                      {room.sharingType > 4 && (
                                        <span className={styles.bedExtra}>+{room.sharingType - 4}</span>
                                      )}
                                    </div>
                                    <span className={styles.roomBedsLabel}>
                                      {room.sharingType} bed{room.sharingType > 1 ? "s" : ""} {isEditing ? "▲" : "▼"}
                                    </span>
                                  </button>
                                </div>

                                {/* ── Delete room error ── */}
                                {deleteRoomError?.roomId === room.id && (
                                  <p style={{ color: "#e63946", fontSize: 11, margin: "4px 0 0", textAlign: "center" }}>
                                    ⚠️ {deleteRoomError.msg}
                                  </p>
                                )}

                                {/* ── Inline Rename Editor ── */}
                                {isRenaming && (
                                  <div className={styles.bedEditor} style={{ marginTop: 6 }}>
                                    <div className={styles.bedEditorTitle}>Rename Room</div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                      <input
                                        type="text"
                                        className={styles.addInput}
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleRenameRoom(room); if (e.key === "Escape") { setRenameRoomId(null); setRenameError(""); } }}
                                        autoFocus
                                        placeholder="New room name"
                                        style={{ flex: 1, padding: "6px 10px", fontSize: 13 }}
                                      />
                                      <button className={styles.saveBtn} onClick={() => handleRenameRoom(room)} disabled={renameSaving} style={{ padding: "6px 14px" }}>
                                        {renameSaving ? "…" : "✓"}
                                      </button>
                                      <button className={styles.cancelBtn} onClick={() => { setRenameRoomId(null); setRenameError(""); }} style={{ padding: "6px 10px" }}>✕</button>
                                    </div>
                                    {renameError && <p style={{ color: "#e63946", fontSize: 11, marginTop: 4 }}>⚠️ {renameError}</p>}
                                  </div>
                                )}

                                {/* ── Inline Bed Editor ── */}
                                {isEditing && (
                                  <div className={styles.bedEditor}>
                                    <div className={styles.bedEditorTitle}>
                                      Edit Beds — Room {room.roomNumber}
                                    </div>
                                    {loadingBeds ? (
                                      <div style={{ padding: "8px 0", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                                        Loading beds…
                                      </div>
                                    ) : (
                                      <div className={styles.bedList}>
                                        {editingBeds.length === 0 && (
                                          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "4px 0" }}>No beds yet. Add one below.</p>
                                        )}
                                        {editingBeds.map((bed) => (
                                          <div key={bed.id} className={styles.bedRow}>
                                            <span className={styles.bedRowLabel}>
                                              {bed.isOccupied ? "🔒" : "🛏️"} Bed {bed.bedNumber}
                                            </span>
                                            <span className={styles.bedRowStatus}>
                                              {bed.isOccupied ? (
                                                <span style={{ color: "#e63946", fontSize: 11 }}>Occupied</span>
                                              ) : (
                                                <span style={{ color: "#2dc653", fontSize: 11 }}>Free</span>
                                              )}
                                            </span>
                                            <button
                                              className={styles.bedDeleteBtn}
                                              onClick={() => handleDeleteBed(bed.id, room)}
                                              disabled={bed.isOccupied}
                                              title={bed.isOccupied ? "Check out tenant first, then you can remove this bed" : "Remove this bed"}
                                            >
                                              {bed.isOccupied ? "🔒" : "🗑️"}
                                            </button>
                                          </div>
                                        ))}
                                        <button
                                          className={styles.addBedBtn}
                                          onClick={() => handleAddBed(room)}
                                          id={`btn-add-bed-${room.id}`}
                                        >
                                          + Add Bed
                                        </button>
                                      </div>
                                    )}
                                    {bedOpError && (
                                      <p className={styles.addError} style={{ marginTop: 6 }}>
                                        ⚠️ {bedOpError}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add Room form */}
                      {addingRoom ? (
                        <div className={styles.addForm}>
                          <div className={styles.addFormHeader}>
                            <span className={styles.addFormTitle}>New Room — Floor {floor}</span>
                          </div>
                          <div className={styles.addFields}>
                            <div className={styles.addField}>
                              <label className={styles.addLabel} htmlFor="room-name-input">Room Name</label>
                              <input
                                id="room-name-input" type="text" className={styles.addInput}
                                placeholder="e.g. A1, 101, Ground Room"
                                value={roomName} onChange={(e) => setRoomName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSaveRoom()}
                                autoFocus disabled={saving}
                              />
                            </div>
                            <div className={styles.addField}>
                              <label className={styles.addLabel}>Beds in this room</label>
                              <div className={styles.bedCounter}>
                                <button type="button" className={styles.bedBtn}
                                  onClick={() => setBedsCount((b) => Math.max(1, b - 1))} disabled={bedsCount <= 1 || saving}>−</button>
                                <div className={styles.bedCountDisplay}>
                                  <span className={styles.bedCountNum}>{bedsCount}</span>
                                  <span className={styles.bedCountLabel}>bed{bedsCount > 1 ? "s" : ""}</span>
                                </div>
                                <button type="button" className={styles.bedBtn}
                                  onClick={() => setBedsCount((b) => Math.min(10, b + 1))} disabled={bedsCount >= 10 || saving}>+</button>
                              </div>
                            </div>
                          </div>
                          {savingError && <p className={styles.addError}>{savingError}</p>}
                          <div className={styles.addActions}>
                            <button className={styles.saveBtn} onClick={handleSaveRoom} disabled={saving} id="btn-save-room">
                              {saving ? <><span className={styles.spinner} /> Saving…</> : "✓ Save Room"}
                            </button>
                            <button className={styles.cancelBtn}
                              onClick={() => { setAddingRoom(false); setSavingError(""); }} disabled={saving}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className={styles.addRoomBtn}
                          onClick={() => { setAddingRoom(true); setRoomName(""); setBedsCount(1); setSavingError(""); }}
                          id={`btn-add-room-${floor}`}
                        >+ Add Room</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.ground}>
            <div className={styles.entrance}><div className={styles.entranceDoor} /></div>
          </div>
        </div>

        {/* Done navigation */}
        <div className={`${styles.navRow} animate-fade-up delay-3`}>
          <button className={styles.prevBtn} onClick={() => router.back()} id="btn-prev">← Back</button>
          <button
            className={styles.nextBtn}
            onClick={() => router.push("/dashboard")}
            id="btn-done"
          >
            {totalRooms > 0 ? `Done (${totalRooms} rooms) →` : "Done →"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function EditBuildingPage() {
  return <Suspense fallback={null}><EditBuildingInner /></Suspense>;
}
