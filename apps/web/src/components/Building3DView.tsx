"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./Building3DView.module.css";

/** Shared whoosh — lowpass filtered noise sweep */
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
  filterType?: number | null;
}

const W = 280;   // building width
const D = 90;    // building depth (front-to-back)
const FH = 68;   // floor height in px

const BED_COLORS = { occupied: "#2dc653", free: "#e63946", pending: "#f4a261" } as const;

function bedColor(bed: Bed) {
  if (!bed.isOccupied) return BED_COLORS.free;
  return bed.tenant?.rent?.status === "pending" ? BED_COLORS.pending : BED_COLORS.occupied;
}
function roomColor(room: Room) {
  const free = room.beds.filter(b => !b.isOccupied).length;
  if (room.beds.length === 0) return "#666";
  if (free === 0) return BED_COLORS.occupied;          // all filled → green
  if (free < room.beds.length) return BED_COLORS.pending; // partial → orange
  return BED_COLORS.free;                               // all empty → red
}
function floorStatusColor(floorRooms: Room[]) {
  const beds = floorRooms.flatMap(r => r.beds);
  if (!beds.length) return "#555";
  const free = beds.filter(b => !b.isOccupied).length;
  if (free === 0) return BED_COLORS.occupied;          // all filled → green
  if (free / beds.length <= 0.35) return BED_COLORS.pending; // mostly filled → orange
  return BED_COLORS.free;                               // mostly empty → red
}

export default function Building3DView({ pgName, totalFloors, rooms, onRoomClick, filterType }: Props) {
  const [rotY, setRotY] = useState(-30);
  const ROT_X = 5; // fixed tilt — nearly forward-facing
  const [activeFloor, setActiveFloor] = useState<number | null>(null);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const touchIsHorizontal = useRef<boolean | null>(null); // null = undecided

  // Mouse drag — horizontal only
  const onMouseDown = (e: React.MouseEvent) => { dragging.current = true; lastX.current = e.clientX; lastY.current = e.clientY; e.preventDefault(); };
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    setRotY(y => Math.max(-180, Math.min(180, y + (e.clientX - lastX.current) * 0.7)));
    lastX.current = e.clientX; lastY.current = e.clientY;
  }, []);
  const onMouseUp = useCallback(() => { dragging.current = false; }, []);
  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [onMouseMove, onMouseUp]);

  // Touch drag — horizontal only; yield vertical to page scroll
  const onTouchStart = (e: React.TouchEvent) => {
    lastX.current = e.touches[0].clientX;
    lastY.current = e.touches[0].clientY;
    touchIsHorizontal.current = null; // reset decision
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - lastX.current);
    const dy = Math.abs(e.touches[0].clientY - lastY.current);
    // First meaningful movement decides direction
    if (touchIsHorizontal.current === null && (dx > 4 || dy > 4)) {
      touchIsHorizontal.current = dx >= dy;
    }
    if (!touchIsHorizontal.current) return; // let page scroll handle it
    e.preventDefault(); // block page scroll while rotating
    setRotY(y => Math.max(-180, Math.min(180, y + (e.touches[0].clientX - lastX.current) * 0.65)));
    lastX.current = e.touches[0].clientX;
    lastY.current = e.touches[0].clientY;
  };
  const onTouchEnd = () => { touchIsHorizontal.current = null; };

  const floors = Array.from({ length: totalFloors }, (_, i) => totalFloors - i); // 5→1
  const totalH = totalFloors * FH;

  function handleFloorClick(floor: number) {
    playWhoosh();
    setActiveFloor(activeFloor === floor ? null : floor);
  }

  const activeFloorRooms = activeFloor !== null ? rooms.filter(r => r.floor === activeFloor) : [];

  return (
    <div className={styles.wrap}>

      {/* ── 3D BUILDING SCENE ── */}
      <div
        className={styles.scene}
        style={{ height: totalH + 260, paddingTop: 190 }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >

        <div className={styles.perspBox}>
          <div className={styles.building} style={{ transform: `rotateX(${ROT_X}deg) rotateY(${rotY}deg)` }}>

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
              const yPos = -((totalFloors - 1 - idx) * FH);
              // Dimmed when a sharing filter is active and this floor has NO matching rooms
              const isFloorDimmed = !!filterType && !floorRooms.some(r => r.sharingType === filterType);
              const isFloorHighlighted = !!filterType && floorRooms.some(r => r.sharingType === filterType);

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
                      opacity: isFloorDimmed ? 0.22 : 1,
                      filter: isFloorDimmed ? "grayscale(0.7)" : "none",
                      outline: isFloorHighlighted && !isActive ? `2px solid ${fc}` : "none",
                      outlineOffset: "2px",
                      transition: "opacity 0.3s, filter 0.3s",
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
                            onClick={e => { e.stopPropagation(); playWhoosh(true); onRoomClick(room); }}
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

                  {/* ── RIGHT SIDE FACE — 🛌 beds floating inside ── */}
                  <div className={styles.floorRight}
                    style={{
                      transform: `translateX(${W / 2}px) rotateY(90deg) translateZ(${-D / 2}px)`,
                      width: D, height: FH,
                      borderBottom: `2px solid ${fc}35`,
                    }}
                    onClick={() => handleFloorClick(floor)}
                  >
                    {/* Beds spread across full width = "floating at different depths" */}
                    <div className={styles.sideFloatBeds}>
                      {floorRooms.flatMap(r => r.beds).slice(0, 4).map((bed, bi) => (
                        <span key={bi} className={styles.sideFloatBed}
                          style={{
                            opacity: bed.isOccupied ? 1 : 0.45,
                            filter: `drop-shadow(0 0 ${bed.isOccupied ? 5 : 2}px ${bedColor(bed)})`,
                          }}
                        >🛌</span>
                      ))}
                      {floorRooms.flatMap(r => r.beds).length === 0 && (
                        <span className={styles.sideFloatBed} style={{ opacity: 0.2 }}>🛌</span>
                      )}
                    </div>
                  </div>

                  {/* ── LEFT SIDE FACE — 🛌 beds + 🪟 window ── */}
                  <div className={styles.floorLeft}
                    style={{
                      transform: `translateX(${-W / 2}px) rotateY(-90deg) translateZ(${-D / 2}px)`,
                      width: D, height: FH,
                    }}
                  >
                    <div className={styles.sideFloatBeds}>
                      {floorRooms.flatMap(r => r.beds).slice(0, 4).map((bed, bi) => (
                        <span key={bi} className={styles.sideFloatBed}
                          style={{
                            opacity: bed.isOccupied ? 1 : 0.45,
                            filter: `drop-shadow(0 0 ${bed.isOccupied ? 5 : 2}px ${bedColor(bed)})`,
                          }}
                        >🛌</span>
                      ))}
                      {floorRooms.flatMap(r => r.beds).length === 0 && (
                        <span className={styles.sideFloatBed} style={{ opacity: 0.2 }}>🛌</span>
                      )}
                    </div>
                  </div>

                  {/* ── BACK FACE — beds inside the building ── */}
                  <div className={styles.floorBack}
                    style={{
                      transform: `translateZ(${-D / 2}px) rotateY(180deg)`,
                      width: W, height: FH,
                      borderBottom: `2px solid ${fc}50`,
                    }}
                  >
                    {/* interior ambient glow */}
                    <div className={styles.backAmbient} style={{ background: `${fc}12` }} />

                    {/* floor label on back */}
                    <div className={styles.backFlLabel} style={{ color: `${fc}90`, borderColor: `${fc}35` }}>
                      FL {floor}
                    </div>

                    {/* rooms + beds */}
                    <div className={styles.backRoomsRow}>
                      {floorRooms.map(room => (
                        <div key={room.id} className={styles.backRoom}>
                          <span className={styles.backRoomNum} style={{ color: `${roomColor(room)}aa` }}>
                            {room.roomNumber}
                          </span>
                          <div className={styles.backBeds}>
                            {room.beds.map(bed => {
                              const bc = bedColor(bed);
                              return (
                                <div key={bed.id} className={styles.backBed}
                                  style={{
                                    borderColor: `${bc}70`,
                                    boxShadow: `0 0 8px ${bc}55, inset 0 0 6px ${bc}15`,
                                  }}
                                >
                                  {/* headboard */}
                                  <div className={styles.bedHeadboard} style={{ background: `${bc}55`, borderBottomColor: `${bc}40` }} />
                                  {/* pillow */}
                                  <div className={styles.bedPillow} style={{ background: bc, boxShadow: `0 0 5px ${bc}90` }} />
                                  {/* blanket */}
                                  <div className={styles.bedBlanket} style={{ background: `${bc}14` }}>
                                    {bed.isOccupied && (
                                      <div className={styles.bedPersonHead} />
                                    )}
                                    <div className={styles.bedLine} />
                                    <div className={styles.bedLine} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {floorRooms.length === 0 && (
                        <span className={styles.backEmpty}>No rooms</span>
                      )}
                    </div>
                  </div>
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
          <div className={styles.panelBackdrop} onClick={() => { playWhoosh(true); setActiveFloor(null); }} />
          <div className={styles.floorPanel}>
            <div className={styles.panelHandle} />
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelFloorLabel}>Floor {activeFloor}</p>
                <h3 className={styles.panelTitle}>🚪 Select a Room</h3>
              </div>
              <button className={styles.panelClose} onClick={() => { playWhoosh(true); setActiveFloor(null); }}>✕</button>
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
                      onClick={() => { playWhoosh(true); setActiveFloor(null); onRoomClick(room); }}
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
