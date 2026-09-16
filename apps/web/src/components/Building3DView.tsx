"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./Building3DView.module.css";

interface Tenant {
  id: string; name: string; phone: string;
  rent?: { status: string; amount: number; paidAmount: number } | null;
}
interface Bed {
  id: string; bedNumber: number; isOccupied: boolean; tenant: Tenant | null;
}
interface Room {
  id: string; roomNumber: string; floor: number;
  sharingType: number; beds: Bed[];
}
interface Props {
  pgName: string; totalFloors: number;
  rooms: Room[]; onRoomClick: (room: Room) => void;
}

const W = 280;   // building width
const D = 90;    // building depth (front-to-back)
const FH = 68;   // floor height in px

const BED_COLORS = { free: "#2dc653", occupied: "#e63946", pending: "#f4a261" } as const;

function bedColor(bed: Bed) {
  if (!bed.isOccupied) return BED_COLORS.free;
  return bed.tenant?.rent?.status === "pending" ? BED_COLORS.pending : BED_COLORS.occupied;
}
function roomColor(room: Room) {
  const free = room.beds.filter(b => !b.isOccupied).length;
  if (room.beds.length === 0) return "#666";
  if (free === 0) return BED_COLORS.occupied;
  if (free < room.beds.length) return BED_COLORS.pending;
  return BED_COLORS.free;
}
function floorStatusColor(floorRooms: Room[]) {
  const beds = floorRooms.flatMap(r => r.beds);
  if (!beds.length) return "#555";
  const free = beds.filter(b => !b.isOccupied).length;
  if (free === 0) return BED_COLORS.occupied;
  if (free / beds.length <= 0.35) return BED_COLORS.pending;
  return BED_COLORS.free;
}

export default function Building3DView({ pgName, totalFloors, rooms, onRoomClick }: Props) {
  const [rotY, setRotY] = useState(-30);
  const [rotX, setRotX] = useState(18);
  const [activeFloor, setActiveFloor] = useState<number | null>(null);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => { dragging.current = true; lastX.current = e.clientX; lastY.current = e.clientY; e.preventDefault(); };
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    setRotY(y => Math.max(-70, Math.min(70, y + (e.clientX - lastX.current) * 0.5)));
    setRotX(x => Math.max(5, Math.min(35, x - (e.clientY - lastY.current) * 0.2)));
    lastX.current = e.clientX; lastY.current = e.clientY;
  }, []);
  const onMouseUp = useCallback(() => { dragging.current = false; }, []);
  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [onMouseMove, onMouseUp]);

  const onTouchStart = (e: React.TouchEvent) => { lastX.current = e.touches[0].clientX; lastY.current = e.touches[0].clientY; };
  const onTouchMove = (e: React.TouchEvent) => {
    setRotY(y => Math.max(-70, Math.min(70, y + (e.touches[0].clientX - lastX.current) * 0.4)));
    setRotX(x => Math.max(5, Math.min(35, x - (e.touches[0].clientY - lastY.current) * 0.15)));
    lastX.current = e.touches[0].clientX; lastY.current = e.touches[0].clientY;
  };

  const floors = Array.from({ length: totalFloors }, (_, i) => totalFloors - i); // 5→1
  const totalH = totalFloors * FH;

  function handleFloorClick(floor: number) {
    // sound
    try {
      const ac = new AudioContext();
      const osc = ac.createOscillator(); const g = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(activeFloor === floor ? 340 : 480, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(activeFloor === floor ? 240 : 340, ac.currentTime + 0.14);
      g.gain.setValueAtTime(0.14, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
      osc.start(); osc.stop(ac.currentTime + 0.2);
    } catch { /* noop */ }
    setActiveFloor(activeFloor === floor ? null : floor);
  }

  const activeFloorRooms = activeFloor !== null ? rooms.filter(r => r.floor === activeFloor) : [];

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>⟵ Drag to rotate ⟶</p>

      {/* ── 3D BUILDING SCENE ── */}
      <div
        className={styles.scene}
        style={{ height: totalH + 260, paddingTop: 155 }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        <div className={styles.perspBox}>
          <div className={styles.building} style={{ transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)` }}>

            {/* ── ROOF ── */}
            <div className={styles.roofGroup} style={{ transform: `translateY(${-totalH - 30}px)` }}>
              {/* Front parapet */}
              <div className={styles.roofFront} style={{ transform: `translateZ(${D / 2}px)`, width: W }}>
                <div className={styles.signBoard}>{pgName}</div>
                <div className={styles.tankRow}>
                  <div className={styles.tank} />
                  <div className={styles.tank} />
                </div>
              </div>
              {/* Right parapet */}
              <div className={styles.roofRight} style={{ transform: `translateX(${W / 2}px) rotateY(90deg) translateZ(${-D / 2}px)`, width: D }} />
              {/* Roof top face */}
              <div className={styles.roofTop} style={{ transform: `rotateX(90deg) translateZ(${-30}px)`, width: W, height: D }} />
              {/* Roof front overhang */}
              <div className={styles.roofOverhang} style={{ transform: `translateZ(${D / 2 + 1}px)`, width: W + 10 }} />
            </div>

            {/* ── FLOORS ── */}
            {floors.map((floor, idx) => {
              const floorRooms = rooms.filter(r => r.floor === floor);
              const fc = floorStatusColor(floorRooms);
              const isActive = activeFloor === floor;
              const yPos = -((totalFloors - 1 - idx) * FH); // FL5 at top (-272), FL1 at 0 (bottom)

              return (
                <div key={floor} className={styles.floorGroup}
                  style={{ transform: `translateY(${yPos}px)` }}>

                  {/* Ceiling slab */}
                  <div className={styles.ceilSlab}
                    style={{
                      transform: `rotateX(90deg) translateZ(${-FH}px)`,
                      width: W, height: D,
                      background: isActive ? `${fc}28` : `#1c2135`,
                    }} />

                  {/* ── FRONT FACE ── */}
                  <div
                    className={`${styles.floorFront} ${isActive ? styles.floorActive : ""}`}
                    style={{
                      transform: `translateZ(${D / 2}px)`,
                      width: W, height: FH,
                      borderBottom: `2px solid ${fc}70`,
                      boxShadow: isActive ? `0 0 30px ${fc}44, inset 0 0 20px ${fc}11` : "none",
                    }}
                    onClick={() => handleFloorClick(floor)}
                  >
                    {isActive && <div className={styles.activeTopBar} style={{ background: fc }} />}

                    {/* Floor badge */}
                    <div className={styles.flBadge} style={{ color: fc, borderColor: `${fc}55` }}>
                      FL {floor}
                    </div>

                    {/* Room windows */}
                    <div className={styles.winRow}>
                      {floorRooms.slice(0, 5).map(room => {
                        const rc = roomColor(room);
                        const free = room.beds.filter(b => !b.isOccupied).length;
                        return (
                          <button key={room.id} className={styles.roomWin}
                            style={{
                              background: `${rc}20`,
                              borderColor: `${rc}55`,
                              boxShadow: `inset 0 0 8px ${rc}18, 0 0 8px ${rc}30`,
                            }}
                            onClick={e => { e.stopPropagation(); onRoomClick(room); }}
                          >
                            <div className={styles.winGlow} style={{ background: `${rc}40` }} />
                            <span className={styles.winRoomNum} style={{ color: rc }}>{room.roomNumber}</span>
                            <div className={styles.winLamp} style={{ background: rc, boxShadow: `0 0 5px ${rc}` }} />
                            <span className={styles.winFree}>{free === 0 ? "FULL" : `${free}✓`}</span>
                          </button>
                        );
                      })}
                      {floorRooms.length === 0 && <span className={styles.noRoomMsg}>No rooms</span>}
                    </div>

                    {/* Balcony rail */}
                    <div className={styles.balconyRail} />
                    <div className={styles.balconyBar} />
                  </div>

                  {/* Active floor neon outline */}
                  {isActive && (
                    <div className={styles.neonOutline}
                      style={{
                        transform: `translateZ(${D / 2 + 2}px)`,
                        width: W + 4, height: FH + 2,
                        borderColor: fc,
                        boxShadow: `0 0 18px ${fc}70, 0 0 36px ${fc}40`,
                      }}
                    />
                  )}

                  {/* ── RIGHT SIDE FACE ── */}
                  <div className={styles.floorRight}
                    style={{
                      transform: `translateX(${W / 2}px) rotateY(90deg) translateZ(${-D / 2}px)`,
                      width: D, height: FH,
                      borderBottom: `2px solid ${fc}35`,
                    }}
                    onClick={() => handleFloorClick(floor)}
                  >
                    <div className={styles.sideWin} />
                    <div className={styles.sideWin} />
                  </div>

                  {/* ── LEFT SIDE FACE ── */}
                  <div className={styles.floorLeft}
                    style={{
                      transform: `translateX(${-W / 2}px) rotateY(-90deg) translateZ(${-D / 2}px)`,
                      width: D, height: FH,
                    }}
                  />
                </div>
              );
            })}

            {/* ── ENTRANCE / GROUND ── */}
            <div className={styles.groundGroup} style={{ transform: `translateY(${FH}px)` }}>
              <div className={styles.groundFront}
                style={{ transform: `translateZ(${D / 2}px)`, width: W }}>
                <div className={styles.doorGroup}>
                  <div className={styles.door}><div className={styles.doorKnob} /></div>
                  <div className={styles.door}><div className={styles.doorKnob} /></div>
                </div>
                <div className={styles.stairsLine} />
                <span className={styles.groundTxt}>ENTRANCE</span>
              </div>
              <div className={styles.groundRight}
                style={{ transform: `translateX(${W / 2}px) rotateY(90deg) translateZ(${-D / 2}px)`, width: D }} />
              <div className={styles.groundSlab}
                style={{ transform: `rotateX(90deg) translateZ(${38}px)`, width: W + 80, height: D + 80 }} />
            </div>

          </div>
        </div>
      </div>

      {/* ── FLOOR DETAIL SLIDE-UP ── */}
      {activeFloor !== null && (
        <>
          <div className={styles.panelBackdrop} onClick={() => setActiveFloor(null)} />
          <div className={styles.floorPanel}>
            <div className={styles.panelHandle} />
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelFloorLabel}>Floor {activeFloor}</p>
                <h3 className={styles.panelTitle}>🚪 Select a Room</h3>
              </div>
              <button className={styles.panelClose} onClick={() => setActiveFloor(null)}>✕</button>
            </div>

            {activeFloorRooms.length === 0 ? (
              <p className={styles.emptyMsg}>No rooms on this floor.</p>
            ) : (
              <div className={styles.roomGrid}>
                {activeFloorRooms.map(room => {
                  const rc = roomColor(room);
                  const free = room.beds.filter(b => !b.isOccupied).length;
                  const sharingLabel = `${room.sharingType}-Share`;
                  return (
                    <button key={room.id} className={styles.roomCard}
                      style={{ borderColor: `${rc}44` }}
                      onClick={() => { setActiveFloor(null); onRoomClick(room); }}
                    >
                      {/* Header */}
                      <div className={styles.rcHeader}>
                        <span className={styles.rcNum} style={{ color: rc }}>{room.roomNumber}</span>
                        <span className={styles.rcShare} style={{ background: `${rc}18`, color: rc, borderColor: `${rc}35` }}>
                          {sharingLabel}
                        </span>
                      </div>

                      {/* Bed dots */}
                      <div className={styles.rcBeds}>
                        {room.beds.map(bed => (
                          <div key={bed.id} className={styles.rcBed}
                            style={{ background: bedColor(bed), boxShadow: `0 0 5px ${bedColor(bed)}80` }}
                            title={bed.isOccupied ? (bed.tenant?.name || "Occupied") : "Free"}
                          />
                        ))}
                      </div>

                      {/* Status */}
                      <span className={styles.rcStatus} style={{ color: rc }}>
                        {free === 0 ? "🔴 Full" : free === room.beds.length ? `🟢 ${free} free` : `🟡 ${free} free`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
