"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  sharingType: number;
}

const PG_TYPE_LABEL: Record<string, string> = {
  gents: "Gents 🚹",
  ladies: "Ladies 🚺",
  "co-living": "Co-Living 🧑‍🤝‍🧑",
};

export default function BuildingPage() {
  const router = useRouter();

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

  const loadRooms = useCallback(async (pgId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/rooms?pgId=${pgId}`);
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
  }, []);

  useEffect(() => {
    const pgId = localStorage.getItem("pg_eg_pg_id");
    if (!pgId) { setLoading(false); return; }

    fetch(`${API_URL}/api/pgs/${pgId}`)
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
  }, [loadRooms]);

  function openFloor(floor: number) {
    if (activeFloor === floor) {
      setActiveFloor(null);
      setAddingRoom(false);
    } else {
      setActiveFloor(floor);
      setAddingRoom(false);
      setRoomName("");
      setBedsCount(1);
      setSavingError("");
    }
  }

  async function handleSaveRoom() {
    setSavingError("");
    if (!roomName.trim()) { setSavingError("Enter a room name"); return; }
    if (activeFloor === null) return;

    const pgId = localStorage.getItem("pg_eg_pg_id");
    if (!pgId) { setSavingError("PG not found. Go back and fill PG Details."); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pgId,
          roomNumber: roomName.trim(),
          floor: activeFloor,
          bedsCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      setRoomsByFloor((prev) => ({
        ...prev,
        [activeFloor]: [...(prev[activeFloor] || []), data.room],
      }));
      setRoomName("");
      setBedsCount(1);
      setAddingRoom(false);
    } catch (err) {
      setSavingError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom(roomId: string, floor: number) {
    try {
      await fetch(`${API_URL}/api/rooms/${roomId}`, { method: "DELETE" });
      setRoomsByFloor((prev) => ({
        ...prev,
        [floor]: (prev[floor] || []).filter((r) => r.id !== roomId),
      }));
    } catch { /* no-op */ }
  }

  const totalRooms = Object.values(roomsByFloor).reduce((s, r) => s + r.length, 0);
  const totalBeds = Object.values(roomsByFloor).reduce(
    (s, r) => s + r.reduce((bs, room) => bs + room.sharingType, 0), 0
  );

  // Floors top→bottom (Floor N at top, Floor 1 at bottom)
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
          <Link href="/add-pg/pg-details" className={styles.backBtn} id="btn-back">
            ← Back
          </Link>
          <div className={styles.logo}>
            <span className={styles.logoPG}>PG</span>
            <span className={styles.logoDash}>-</span>
            <span className={styles.logoEG}>EG</span>
          </div>
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

        {/* ─── Building visual ─── */}
        <div className={`${styles.building} animate-fade-up delay-2`}>

          {/* Roof */}
          <div className={styles.roofWrap}>
            <div className={styles.roofLeft} />
            <div className={styles.roofMiddle}>🏗️</div>
            <div className={styles.roofRight} />
          </div>

          {/* Floors */}
          <div className={styles.floors}>
            {floorNums.map((floor) => {
              const floorRooms = roomsByFloor[floor] || [];
              const isActive = activeFloor === floor;
              const litWindows = Math.min(floorRooms.length, 5);

              return (
                <div key={floor} className={styles.floorWrap}>
                  {/* Clickable floor bar */}
                  <button
                    className={`${styles.floorBar} ${isActive ? styles.floorBarActive : ""}`}
                    onClick={() => openFloor(floor)}
                    id={`floor-btn-${floor}`}
                  >
                    {/* Windows */}
                    <div className={styles.windows}>
                      {[0, 1, 2, 3, 4].map((wi) => (
                        <div
                          key={wi}
                          className={`${styles.win} ${wi < litWindows ? styles.winLit : ""}`}
                        />
                      ))}
                    </div>

                    {/* Floor label */}
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

                  {/* Expanded panel */}
                  {isActive && (
                    <div className={styles.floorPanel}>
                      {/* Rooms grid */}
                      {floorRooms.length > 0 && (
                        <div className={styles.roomGrid}>
                          {floorRooms.map((room) => (
                            <div key={room.id} className={styles.roomCard}>
                              <button
                                className={styles.roomDelete}
                                onClick={() => handleDeleteRoom(room.id, floor)}
                                title="Remove room"
                              >×</button>
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
                              <span className={styles.roomBedsLabel}>{room.sharingType} bed{room.sharingType > 1 ? "s" : ""}</span>
                            </div>
                          ))}
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
                              <label className={styles.addLabel} htmlFor="room-name-input">
                                Room Name
                              </label>
                              <input
                                id="room-name-input"
                                type="text"
                                className={styles.addInput}
                                placeholder='e.g. A1, 101, Ground Room'
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSaveRoom()}
                                autoFocus
                                disabled={saving}
                              />
                            </div>

                            <div className={styles.addField}>
                              <label className={styles.addLabel}>Beds in this room</label>
                              <div className={styles.bedCounter}>
                                <button
                                  type="button"
                                  className={styles.bedBtn}
                                  onClick={() => setBedsCount((b) => Math.max(1, b - 1))}
                                  disabled={bedsCount <= 1 || saving}
                                >−</button>
                                <div className={styles.bedCountDisplay}>
                                  <span className={styles.bedCountNum}>{bedsCount}</span>
                                  <span className={styles.bedCountLabel}>bed{bedsCount > 1 ? "s" : ""}</span>
                                </div>
                                <button
                                  type="button"
                                  className={styles.bedBtn}
                                  onClick={() => setBedsCount((b) => Math.min(10, b + 1))}
                                  disabled={bedsCount >= 10 || saving}
                                >+</button>
                              </div>
                            </div>
                          </div>

                          {savingError && <p className={styles.addError}>{savingError}</p>}

                          <div className={styles.addActions}>
                            <button
                              className={styles.saveBtn}
                              onClick={handleSaveRoom}
                              disabled={saving}
                              id="btn-save-room"
                            >
                              {saving ? <><span className={styles.spinner} /> Saving…</> : "✓ Save Room"}
                            </button>
                            <button
                              className={styles.cancelBtn}
                              onClick={() => { setAddingRoom(false); setSavingError(""); }}
                              disabled={saving}
                            >Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className={styles.addRoomBtn}
                          onClick={() => { setAddingRoom(true); setRoomName(""); setBedsCount(1); setSavingError(""); }}
                          id={`btn-add-room-${floor}`}
                        >
                          + Add Room
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ground */}
          <div className={styles.ground}>
            <div className={styles.entrance}>
              <div className={styles.entranceDoor} />
            </div>
          </div>
        </div>

        {/* Prev / Done navigation */}
        <div className={`${styles.navRow} animate-fade-up delay-3`}>
          <Link href="/add-pg/pg-details" className={styles.prevBtn} id="btn-prev">
            ← Prev
          </Link>
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
