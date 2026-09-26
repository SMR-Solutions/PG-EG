"use client";

import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import styles from "./Building3DView.module.css";

interface Tenant {
  id: string; name: string; phone: string;
  rent?: { status: string; amount: number; paidAmount: number } | null;
}
interface Bed { id: string; bedNumber: number; isOccupied: boolean; tenant: Tenant | null; }
interface Room { id: string; roomNumber: string; floor: number; sharingType: number; beds: Bed[]; }
interface Props {
  pgName: string; totalFloors: number;
  rooms: Room[]; onRoomClick: (room: Room) => void;
  filterType?: number | null;
}

// Building geometry constants — FH is 1.45 for generous floor height matching Classic 3D
const FW = 5.4, FD = 2.2, FH = 1.45, SLAB = 0.08, WT = 0.06;

const C = {
  wall: "#c8bfae", wallBack: "#b0a898", wallSide: "#b8af9e",
  slab: "#d4ccbc", roofSlab: "#c0b8a8", parapet: "#ccc4b4",
  ground: "#9a9488", sidewalk: "#c4beb6",
  door: "#7a5c3a", doorFrame: "#5c4428", fence: "#d8d2c8",
  tank: "#1a55aa", lamp: "#3a3630",
  tree1: "#2a6e2a", tree2: "#1e5a1e", trunk: "#6b4020",
  winFrame: "#7a7060", winGlass: "#ffa830",
  solar: "#1a2560", solarCell: "#2244bb",
};

const BED_COLORS = { occupied: "#2dc653", free: "#e63946", pending: "#f4a261" } as const;

function bedColor(bed: Bed) {
  if (!bed.isOccupied) return BED_COLORS.free;
  return bed.tenant?.rent?.status === "pending" ? BED_COLORS.pending : BED_COLORS.occupied;
}

function roomColor(room: Room) {
  const free = room.beds.filter(b => !b.isOccupied).length;
  if (room.beds.length === 0) return "#888";
  if (free === 0) return BED_COLORS.occupied;
  if (free < room.beds.length) return BED_COLORS.pending;
  return BED_COLORS.free;
}

function floorStatusColor(floorRooms: Room[]) {
  const beds = floorRooms.flatMap(r => r.beds);
  if (!beds.length) return "#888";
  const free = beds.filter(b => !b.isOccupied).length;
  if (free === 0) return BED_COLORS.occupied;
  if (free / beds.length <= 0.35) return BED_COLORS.pending;
  return BED_COLORS.free;
}

function playWhoosh(short = false) {
  try {
    const ac = new AudioContext(), dur = short ? 0.18 : 0.32;
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(short ? 2800 : 1800, ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(short ? 400 : 180, ac.currentTime + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(short ? 0.16 : 0.22, ac.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(); src.stop(ac.currentTime + dur + 0.01);
  } catch {}
}

/* ─────────────────────────────────────────────────────────────
   CANVAS TEXTURE GENERATORS
   Native WebGL textures that sit directly on 3D geometry.
   Zero DOM overlay lag, zero scale-flicker on load, 100% responsive.
───────────────────────────────────────────────────────────── */

function createFloorBadgeTexture(floorNumber: number, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext("2d")!;

  // Solid black tile
  ctx.fillStyle = "#0a0e18";
  ctx.fillRect(0, 0, 512, 384);

  // Border colored by floor occupancy
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 498, 370);

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(14, 14, 484, 160);

  // White "FLOOR"
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 64px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FLOOR", 256, 105);

  // White Floor Number — bold, ultra-sharp
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 170px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(String(floorNumber), 256, 260);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createRoomWindowTexture(
  roomNumber: string,
  shareType: number,
  freeBeds: number,
  totalBeds: number,
  statusColor: string,
  isDimmed: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  // 1. Dynamic tile background & text colors based on occupancy status
  let tileBg: string;
  let textColor: string;
  let pillBg: string;

  if (isDimmed) {
    tileBg = "#222733";
    textColor = "#7a8292";
    pillBg = "rgba(0, 0, 0, 0.4)";
  } else if (freeBeds === 0) {
    // GREEN TILE (Occupied / Full) -> White text
    tileBg = "#16a34a";
    textColor = "#ffffff";
    pillBg = "rgba(0, 36, 12, 0.78)";
  } else if (freeBeds < totalBeds) {
    // ORANGE TILE (Pending / Partial) -> Bold Black text
    tileBg = "#f5901e";
    textColor = "#0a0c12";
    pillBg = "rgba(0, 0, 0, 0.78)";
  } else {
    // RED TILE (Free / Vacant) -> Bold Black text
    tileBg = "#dc2626";
    textColor = "#0a0c12";
    pillBg = "rgba(0, 0, 0, 0.78)";
  }

  // Draw colorful tile body
  ctx.fillStyle = tileBg;
  ctx.fillRect(0, 0, 768, 512);

  // Outer frame for depth
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 754, 498);

  // Subtle glass highlight reflection at top
  const grad = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.25)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(14, 14, 740, 206);

  // Room Number Text — Large, heavy bold, ultra-high contrast
  ctx.fillStyle = textColor;
  ctx.font = "900 185px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(roomNumber, 384, 215);

  // Bottom info pill (Share Type & Free Status)
  const pillW = 580, pillH = 92, pillX = (768 - pillW) / 2, pillY = 368;
  ctx.fillStyle = pillBg;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.fillRect(pillX, pillY, pillW, pillH);
  }

  const statusLabel = freeBeds === 0 ? "FULL" : `${freeBeds} Free`;
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`${shareType}-Share • ${statusLabel}`, 384, pillY + 46);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Disable mipmaps to eliminate distance blurring / fading
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createEntranceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0a0e18";
  ctx.fillRect(0, 0, 512, 384);

  ctx.strokeStyle = "#ffc04a";
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 498, 370);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 64px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FLOOR", 256, 105);

  ctx.fillStyle = "#ffc04a";
  ctx.font = "900 170px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("G", 256, 260);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createRoofSignTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 384;
  const ctx = canvas.getContext("2d")!;

  // Deep solid glossy black acrylic signboard
  ctx.fillStyle = "#080c14";
  ctx.fillRect(0, 0, 1536, 384);

  // Metallic frame
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 1522, 370);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, 1492, 340);

  // PG Name — pure solid bold white; dynamically scale font size so it NEVER truncates
  const displayName = name.trim().toUpperCase();
  let fontSize = 126;
  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  while (ctx.measureText(displayName).width > 1400 && fontSize > 40) {
    fontSize -= 4;
    ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  }

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayName, 768, 192);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* ─────────────────────────────────────────────────────────────
   3D ENVIRONMENT & SCENERY MESHES
───────────────────────────────────────────────────────────── */

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.55 * s, 0]}><cylinderGeometry args={[0.07 * s, 0.1 * s, 1.1 * s, 7]} /><meshStandardMaterial color={C.trunk} roughness={0.95} /></mesh>
      <mesh position={[0, 1.45 * s, 0]}><sphereGeometry args={[0.42 * s, 9, 7]} /><meshStandardMaterial color={C.tree1} roughness={0.9} /></mesh>
      <mesh position={[0.18 * s, 1.72 * s, 0.1 * s]}><sphereGeometry args={[0.28 * s, 8, 6]} /><meshStandardMaterial color={C.tree2} roughness={0.88} /></mesh>
      <mesh position={[-0.14 * s, 1.65 * s, -0.1 * s]}><sphereGeometry args={[0.24 * s, 8, 6]} /><meshStandardMaterial color={C.tree1} roughness={0.9} /></mesh>
      <mesh position={[0, 1.95 * s, 0]}><sphereGeometry args={[0.18 * s, 7, 5]} /><meshStandardMaterial color={C.tree2} roughness={0.85} /></mesh>
    </group>
  );
}

function EntranceLamp({ x, z, side }: { x: number; z: number; side: "left" | "right" }) {
  const dir = side === "left" ? 1 : -1;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.04, 0.055, 2.8, 7]} /><meshStandardMaterial color={C.lamp} roughness={0.65} metalness={0.55} /></mesh>
      <mesh position={[dir * 0.32, 2.76, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.022, 0.022, 0.64, 5]} /><meshStandardMaterial color={C.lamp} roughness={0.65} metalness={0.55} /></mesh>
      <mesh position={[dir * 0.64, 2.7, 0]} rotation={[0, 0, dir * -0.3]}><cylinderGeometry args={[0.055, 0.12, 0.18, 8]} /><meshStandardMaterial color="#222228" roughness={0.5} metalness={0.4} /></mesh>
      <mesh position={[dir * 0.64, 2.76, 0]}><sphereGeometry args={[0.065, 8, 6]} /><meshStandardMaterial color="#fff8d0" emissive={new THREE.Color("#ffcc50")} emissiveIntensity={2.6} roughness={0.15} /></mesh>
      <pointLight position={[dir * 0.64, 2.5, 0.6]} intensity={2.2} color="#ffbb30" distance={5.5} decay={2} />
    </group>
  );
}

function Car({ x, z, rotY = 0 }: { x: number; z: number; rotY?: number }) {
  const body = "#3a7a8a", dark = "#2a5a68", glass = "#7aaabb";
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.18, 0]}><boxGeometry args={[1.02, 0.26, 2.1]} /><meshStandardMaterial color={body} roughness={0.28} metalness={0.42} /></mesh>
      <mesh position={[0, 0.42, -0.08]}><boxGeometry args={[0.9, 0.3, 1.22]} /><meshStandardMaterial color={body} roughness={0.28} metalness={0.4} /></mesh>
      <mesh position={[0, 0.3, 0.72]}><boxGeometry args={[0.96, 0.14, 0.44]} /><meshStandardMaterial color={body} roughness={0.3} metalness={0.4} /></mesh>
      <mesh position={[0, 0.3, -0.82]}><boxGeometry args={[0.96, 0.14, 0.34]} /><meshStandardMaterial color={body} roughness={0.3} metalness={0.4} /></mesh>
      <mesh position={[0, 0.57, -0.06]}><boxGeometry args={[0.87, 0.08, 1.18]} /><meshStandardMaterial color={body} roughness={0.28} metalness={0.4} /></mesh>
      {[-0.2, 0.2].map((rz, i) => <mesh key={i} position={[0, 0.615, rz]}><boxGeometry args={[0.88, 0.018, 0.045]} /><meshStandardMaterial color="#888890" roughness={0.4} metalness={0.7} /></mesh>)}
      <mesh position={[0, 0.46, 0.53]}><boxGeometry args={[0.84, 0.28, 0.065]} /><meshStandardMaterial color={glass} roughness={0.05} metalness={0.1} transparent opacity={0.68} /></mesh>
      <mesh position={[0, 0.46, -0.68]}><boxGeometry args={[0.82, 0.26, 0.06]} /><meshStandardMaterial color={glass} roughness={0.05} transparent opacity={0.62} /></mesh>
      {([-0.46, 0.46] as number[]).map((sx, i) => <mesh key={i} position={[sx, 0.45, -0.06]}><boxGeometry args={[0.05, 0.22, 1.0]} /><meshStandardMaterial color={glass} roughness={0.05} transparent opacity={0.58} /></mesh>)}
      {([-0.46, 0.46] as number[]).flatMap((sx, si) => ([0.52, -0.06, -0.6] as number[]).map((pz, pi) => <mesh key={si + "-" + pi} position={[sx, 0.42, pz]}><boxGeometry args={[0.05, 0.3, 0.06]} /><meshStandardMaterial color={dark} roughness={0.4} metalness={0.3} /></mesh>))}
      {([-0.36, 0.36] as number[]).map((hx, i) => <mesh key={i} position={[hx, 0.22, 1.07]}><boxGeometry args={[0.24, 0.1, 0.05]} /><meshStandardMaterial color="#d8f0ff" emissive={new THREE.Color("#aaddff")} emissiveIntensity={0.5} roughness={0.1} /></mesh>)}
      <mesh position={[0, 0.29, 1.07]}><boxGeometry args={[0.88, 0.03, 0.04]} /><meshStandardMaterial color="#ffffff" emissive={new THREE.Color("#ffffff")} emissiveIntensity={0.6} roughness={0.15} /></mesh>
      {([-0.38, 0.38] as number[]).map((tx, i) => <mesh key={i} position={[tx, 0.26, -1.07]}><boxGeometry args={[0.2, 0.1, 0.04]} /><meshStandardMaterial color="#cc1111" emissive={new THREE.Color("#cc1111")} emissiveIntensity={0.9} roughness={0.2} /></mesh>)}
      <mesh position={[0, 0.16, 1.07]}><boxGeometry args={[0.94, 0.16, 0.065]} /><meshStandardMaterial color={dark} roughness={0.5} metalness={0.25} /></mesh>
      <mesh position={[0, 0.16, -1.07]}><boxGeometry args={[0.94, 0.16, 0.065]} /><meshStandardMaterial color={dark} roughness={0.5} metalness={0.25} /></mesh>
      {([-0.5, 0.5] as number[]).flatMap((wx, wi) => ([-0.72, 0.72] as number[]).map((wz, wzi) => (
        <group key={wi + "-" + wzi} position={[wx, 0.145, wz]}>
          <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.145, 0.145, 0.12, 14]} /><meshStandardMaterial color="#181818" roughness={0.92} /></mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.095, 0.095, 0.125, 12]} /><meshStandardMaterial color="#a0a0b0" roughness={0.25} metalness={0.75} /></mesh>
        </group>
      )))}
    </group>
  );
}

function Bike({ x, z, rotY = 0 }: { x: number; z: number; rotY?: number }) {
  const bBlue = "#2288cc", rim = "#aacc00", fork = "#c8a020";
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.25, 0.02]}><boxGeometry args={[0.16, 0.22, 0.52]} /><meshStandardMaterial color="#222228" roughness={0.55} metalness={0.45} /></mesh>
      <mesh position={[0, 0.38, 0.16]}><boxGeometry args={[0.15, 0.14, 0.3]} /><meshStandardMaterial color={bBlue} roughness={0.28} metalness={0.32} /></mesh>
      <mesh position={[-0.09, 0.28, 0.04]}><boxGeometry args={[0.04, 0.18, 0.44]} /><meshStandardMaterial color={bBlue} roughness={0.3} metalness={0.28} /></mesh>
      <mesh position={[0.09, 0.28, 0.04]}><boxGeometry args={[0.04, 0.18, 0.44]} /><meshStandardMaterial color={bBlue} roughness={0.3} metalness={0.28} /></mesh>
      <mesh position={[0, 0.4, -0.16]}><boxGeometry args={[0.13, 0.055, 0.38]} /><meshStandardMaterial color="#111" roughness={0.88} /></mesh>
      <mesh position={[0, 0.34, -0.41]}><boxGeometry args={[0.11, 0.08, 0.2]} /><meshStandardMaterial color={bBlue} roughness={0.3} metalness={0.28} /></mesh>
      <mesh position={[0.035, 0.24, 0.46]} rotation={[0.18, 0, 0]}><cylinderGeometry args={[0.022, 0.026, 0.52, 6]} /><meshStandardMaterial color={fork} roughness={0.28} metalness={0.72} /></mesh>
      <mesh position={[-0.035, 0.24, 0.46]} rotation={[0.18, 0, 0]}><cylinderGeometry args={[0.022, 0.026, 0.52, 6]} /><meshStandardMaterial color={fork} roughness={0.28} metalness={0.72} /></mesh>
      <mesh position={[0, 0.46, 0.34]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.018, 0.018, 0.36, 6]} /><meshStandardMaterial color="#333" roughness={0.4} metalness={0.7} /></mesh>
      <group position={[0, 0.135, 0.55]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.135, 0.135, 0.1, 14]} /><meshStandardMaterial color="#0f0f0f" roughness={0.9} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.082, 0.082, 0.105, 10]} /><meshStandardMaterial color={rim} roughness={0.3} metalness={0.5} /></mesh>
      </group>
      <group position={[0, 0.135, -0.5]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.135, 0.135, 0.11, 14]} /><meshStandardMaterial color="#0f0f0f" roughness={0.9} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.084, 0.084, 0.115, 10]} /><meshStandardMaterial color={rim} roughness={0.3} metalness={0.5} /></mesh>
      </group>
    </group>
  );
}

function SolarPanels({ position }: { position: [number, number, number] }) {
  const pW = 0.64, pD = 0.38, gap = 0.07;
  return (
    <group position={position} rotation={[-0.22, 0, 0]}>
      {[0, 1].map(r => [0, 1, 2].map(c => (
        <group key={r + "-" + c} position={[c * (pW + gap) - (2 * (pW + gap) / 2), r * (pD + gap) * 0.82, r * (pD + gap) * 0.48]}>
          <mesh><boxGeometry args={[pW, 0.022, pD]} /><meshStandardMaterial color={C.solar} roughness={0.28} metalness={0.42} /></mesh>
          {[0, 1, 2].map(cx => [0, 1].map(cy => (
            <mesh key={cx + "-" + cy} position={[(cx - 1) * (pW / 3), 0.016, (cy - 0.5) * (pD / 2)]}>
              <boxGeometry args={[pW / 3 - 0.025, 0.012, pD / 2 - 0.025]} />
              <meshStandardMaterial color={C.solarCell} roughness={0.2} metalness={0.5} emissive={new THREE.Color("#001144")} emissiveIntensity={0.35} />
            </mesh>
          )))}
        </group>
      )))}
    </group>
  );
}

function BalconyRailing({ y, dimmed }: { y: number; dimmed: boolean }) {
  const alpha = dimmed ? 0.15 : 0.88, posts = 8;
  return (
    <group position={[0, y, FD / 2 + 0.02]}>
      <mesh position={[0, 0.13, 0]}><boxGeometry args={[FW + 0.06, 0.04, 0.04]} /><meshStandardMaterial color={C.fence} roughness={0.7} transparent opacity={alpha} /></mesh>
      <mesh position={[0, 0.03, 0]}><boxGeometry args={[FW + 0.04, 0.025, 0.03]} /><meshStandardMaterial color={C.fence} roughness={0.7} transparent opacity={alpha} /></mesh>
      {Array.from({length: posts}, (_, i) => {
        const bx = -FW / 2 + 0.3 + i * (FW * 0.88 / (posts - 1));
        return <mesh key={i} position={[bx, 0.07, 0]}><boxGeometry args={[0.025, 0.1, 0.025]} /><meshStandardMaterial color="#e8e2d8" roughness={0.75} transparent opacity={alpha} /></mesh>;
      })}
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROOM WINDOW COMPONENT WITH NATIVE TEXTURE
───────────────────────────────────────────────────────────── */

interface RoomWindowProps {
  room: Room;
  wx: number;
  winW: number;
  winH: number;
  isFloorDimmed: boolean;
  onRoomClick: (r: Room) => void;
  setHovered: (v: boolean) => void;
}

function RoomWindow({ room, wx, winW, winH, isFloorDimmed, onRoomClick, setHovered }: RoomWindowProps) {
  const { invalidate } = useThree();
  const rc = roomColor(room);
  const freeBeds = room.beds.filter(b => !b.isOccupied).length;

  const windowTexture = useMemo(() => {
    return createRoomWindowTexture(
      room.roomNumber,
      room.sharingType,
      freeBeds,
      room.beds.length,
      rc,
      isFloorDimmed
    );
  }, [room.roomNumber, room.sharingType, freeBeds, room.beds.length, rc, isFloorDimmed]);

  useEffect(() => {
    return () => {
      windowTexture.dispose();
    };
  }, [windowTexture]);

  return (
    <group position={[wx, FH / 2 + SLAB, FD / 2 + 0.02]}>
      {/* Outer dark window frame */}
      <mesh position={[0, 0, -0.005]}>
        <boxGeometry args={[winW + 0.09, winH + 0.09, 0.03]} />
        <meshStandardMaterial color={C.winFrame} roughness={0.75} transparent opacity={isFloorDimmed ? 0.2 : 1} />
      </mesh>

      {/* Front face with crisp illuminated window sign texture */}
      <mesh
        position={[0, 0, 0.018]}
        onClick={e => {
          e.stopPropagation();
          playWhoosh(true);
          onRoomClick(room);
          invalidate();
        }}
        onPointerEnter={e => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
      >
        <boxGeometry args={[winW, winH, 0.02]} />
        <meshStandardMaterial
          map={windowTexture}
          roughness={0.22}
          metalness={0.08}
          transparent
          opacity={isFloorDimmed ? 0.35 : 1}
        />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   FLOOR MESH WITH UNIFORM COLUMN LAYOUT & TALL PROPORTIONS
───────────────────────────────────────────────────────────── */

interface FMP {
  floor: number;
  rooms: Room[];
  isActive: boolean;
  filterType?: number | null;
  maxCols: number;
  onFloorClick: () => void;
  onRoomClick: (r: Room) => void;
  setHovered: (v: boolean) => void;
}

function FloorMesh({
  floor,
  rooms,
  isActive,
  filterType,
  maxCols,
  onFloorClick,
  onRoomClick,
  setHovered
}: FMP) {
  const { invalidate } = useThree();
  const floorRooms = rooms.filter(r => r.floor === floor);
  const fc = floorStatusColor(floorRooms);
  const isFloorDimmed = !!filterType && !floorRooms.some(r => r.sharingType === filterType);
  const isFloorHighlighted = !!filterType && floorRooms.some(r => r.sharingType === filterType);
  const y = floor * FH;
  const alpha = isFloorDimmed ? 0.28 : 1;

  // Layout math:
  // Floor badge is on the far left.
  // Room area spans from roomStart to roomEnd, partitioned into fixed columns (maxCols)
  // so Room 1 on any floor is ALWAYS in column 0, Room 2 is ALWAYS in column 1!
  const FL_W = 0.72, FL_H = 0.52;
  const roomStart = -FW / 2 + FL_W + 0.35;
  const roomEnd = FW / 2 - 0.25;
  const roomAreaW = roomEnd - roomStart;
  const colW = roomAreaW / Math.max(maxCols, 1);
  const winW = Math.min(colW * 0.78, 1.15);
  const winH = FH * 0.54;

  const floorBadgeTex = useMemo(() => {
    return createFloorBadgeTexture(floor, fc);
  }, [floor, fc]);

  useEffect(() => {
    return () => {
      floorBadgeTex.dispose();
    };
  }, [floorBadgeTex]);

  const allBeds = floorRooms.flatMap(r => r.beds);
  const showBeds = allBeds.slice(0, 6);
  const bedSZ = FD * 0.68;

  return (
    <group position={[0, y, 0]}>
      {/* Slab */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[FW + 0.06, SLAB, FD + 0.04]} />
        <meshStandardMaterial color={C.slab} roughness={0.85} transparent opacity={alpha} />
      </mesh>

      {/* Front wall */}
      <mesh
        position={[0, FH / 2 + SLAB, FD / 2]}
        onClick={e => {
          e.stopPropagation();
          onFloorClick();
          invalidate();
        }}
        onPointerEnter={e => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
      >
        <boxGeometry args={[FW, FH, WT]} />
        <meshStandardMaterial
          color={isActive ? "#d4cabc" : C.wall}
          roughness={0.78}
          emissive={isActive ? new THREE.Color(fc) : isFloorHighlighted ? new THREE.Color(fc) : new THREE.Color(0, 0, 0)}
          emissiveIntensity={isActive ? 0.12 : isFloorHighlighted ? 0.06 : 0}
          transparent
          opacity={alpha}
        />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, FH / 2 + SLAB, -FD / 2]}>
        <boxGeometry args={[FW, FH, WT]} />
        <meshStandardMaterial color={C.wallBack} roughness={0.85} transparent opacity={alpha * 0.9} />
      </mesh>

      {/* Left wall — transparent to peek into beds */}
      <mesh position={[-FW / 2, FH / 2 + SLAB, 0]}>
        <boxGeometry args={[WT, FH, FD]} />
        <meshStandardMaterial color={C.wallSide} roughness={0.82} transparent opacity={alpha * 0.25} />
      </mesh>

      {/* Bed silhouettes on left side */}
      {showBeds.map((bed, bi) => {
        const bc = bedColor(bed);
        const bz = showBeds.length > 1 ? -bedSZ / 2 + (bi / (showBeds.length - 1)) * bedSZ : 0;
        return (
          <group key={bed.id} position={[-FW / 2 + 0.1, SLAB, bz]}>
            {([-0.015, 0.015] as number[]).map((px, pi) => (
              <mesh key={pi} position={[px, 0.06, 0]}>
                <boxGeometry args={[0.016, 0.1, 0.5]} />
                <meshStandardMaterial color="#7a4520" roughness={0.7} transparent opacity={isFloorDimmed ? 0.1 : 0.88} />
              </mesh>
            ))}
            <mesh position={[0, 0.19, -0.25]}>
              <boxGeometry args={[0.04, 0.26, 0.06]} />
              <meshStandardMaterial color="#6a3818" roughness={0.6} transparent opacity={isFloorDimmed ? 0.1 : 0.9} />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[0.038, 0.075, 0.48]} />
              <meshStandardMaterial color="#f0ece0" roughness={0.8} transparent opacity={isFloorDimmed ? 0.08 : 0.9} />
            </mesh>
            <mesh position={[0, 0.14, 0.06]}>
              <boxGeometry args={[0.04, 0.04, 0.32]} />
              <meshStandardMaterial color={bc} emissive={new THREE.Color(bc)} emissiveIntensity={0.28} roughness={0.75} transparent opacity={isFloorDimmed ? 0.1 : 0.88} />
            </mesh>
          </group>
        );
      })}

      {/* Right wall */}
      <mesh position={[FW / 2, FH / 2 + SLAB, 0]}>
        <boxGeometry args={[WT, FH, FD]} />
        <meshStandardMaterial color={C.wallSide} roughness={0.82} transparent opacity={alpha * 0.8} />
      </mesh>

      {/* Right side windows */}
      {([0.5, -0.3] as number[]).map((tz, i) => (
        <group key={i}>
          <mesh position={[FW / 2 + 0.02, FH / 2 + SLAB, tz]}><boxGeometry args={[0.03, FH * 0.44, 0.28]} /><meshStandardMaterial color={C.winFrame} roughness={0.8} transparent opacity={isFloorDimmed ? 0.1 : 0.85} /></mesh>
          <mesh position={[FW / 2 + 0.03, FH / 2 + SLAB, tz]}><boxGeometry args={[0.025, FH * 0.38, 0.22]} /><meshStandardMaterial color={C.winGlass} emissive={new THREE.Color("#ff8800")} emissiveIntensity={isFloorDimmed ? 0.02 : 0.38} roughness={0.22} transparent opacity={isFloorDimmed ? 0.08 : 0.72} /></mesh>
        </group>
      ))}

      {/* FL-X Sign Plaque (Centered vertically on the floor, left-aligned) */}
      <mesh position={[-FW / 2 + FL_W / 2 + 0.12, FH / 2 + SLAB, FD / 2 + 0.036]}>
        <boxGeometry args={[FL_W, FL_H, 0.025]} />
        <meshStandardMaterial
          map={floorBadgeTex}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      {/* Room Windows — placed in consistent column slots across floors */}
      {floorRooms.slice(0, 6).map((room, i) => {
        const wx = roomStart + colW * i + colW / 2;
        return (
          <RoomWindow
            key={room.id}
            room={room}
            wx={wx}
            winW={winW}
            winH={winH}
            isFloorDimmed={isFloorDimmed}
            onRoomClick={onRoomClick}
            setHovered={setHovered}
          />
        );
      })}

      <BalconyRailing y={SLAB} dimmed={isFloorDimmed} />

      {/* Active Floor Highlight Neon Frame */}
      {isActive && (
        <mesh position={[0, FH / 2 + SLAB, FD / 2 + 0.055]}>
          <boxGeometry args={[FW + 0.08, FH + 0.08, 0.008]} />
          <meshStandardMaterial color={fc} emissive={new THREE.Color(fc)} emissiveIntensity={1.6} transparent opacity={0.45} />
        </mesh>
      )}
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   ENTRANCE MESH (GROUND LEVEL)
───────────────────────────────────────────────────────────── */

function EntranceMesh() {
  const entranceTex = useMemo(() => createEntranceTexture(), []);
  useEffect(() => () => entranceTex.dispose(), [entranceTex]);

  return (
    <group>
      <mesh position={[0, 0, 0]}><boxGeometry args={[FW + 0.06, SLAB, FD + 0.04]} /><meshStandardMaterial color={C.slab} roughness={0.85} /></mesh>
      <mesh position={[0, 0.26, FD / 2]}><boxGeometry args={[FW, 0.52, WT]} /><meshStandardMaterial color={C.wall} roughness={0.8} /></mesh>

      {/* Floor G Plaque */}
      <mesh position={[-FW / 2 + 0.48, 0.26, FD / 2 + 0.036]}>
        <boxGeometry args={[0.72, 0.46, 0.025]} />
        <meshStandardMaterial map={entranceTex} roughness={0.3} metalness={0.1} />
      </mesh>

      {/* Main Entrance Door Frame & Double Doors */}
      <mesh position={[0, 0.24, FD / 2 + 0.018]}><boxGeometry args={[1.14, 0.48, 0.03]} /><meshStandardMaterial color={C.doorFrame} roughness={0.8} /></mesh>
      {([-0.28, 0.28] as number[]).map((dx, i) => (
        <mesh key={i} position={[dx, 0.22, FD / 2 + 0.034]}><boxGeometry args={[0.52, 0.44, 0.035]} /><meshStandardMaterial color={C.door} roughness={0.65} metalness={0.05} /></mesh>
      ))}
      {([-0.05, 0.05] as number[]).map((dx, i) => (
        <mesh key={i} position={[dx, 0.22, FD / 2 + 0.055]}><sphereGeometry args={[0.028, 8, 6]} /><meshStandardMaterial color="#d4a840" roughness={0.3} metalness={0.7} /></mesh>
      ))}

      {/* Steps leading up to door */}
      {([0, 1, 2] as number[]).map(s => (
        <mesh key={s} position={[0, s * 0.038 - 0.018, FD / 2 + 0.1 + s * 0.07]}><boxGeometry args={[FW * 0.42, 0.038, 0.14]} /><meshStandardMaterial color={C.slab} roughness={0.9} /></mesh>
      ))}

      {/* Side walls */}
      <mesh position={[-FW / 2, 0.26, 0]}><boxGeometry args={[WT, 0.52, FD]} /><meshStandardMaterial color={C.wallSide} roughness={0.82} /></mesh>
      <mesh position={[FW / 2, 0.26, 0]}><boxGeometry args={[WT, 0.52, FD]} /><meshStandardMaterial color={C.wallSide} roughness={0.82} /></mesh>

      {/* Boundary fence and sidewalk */}
      <mesh position={[0, 0.08, FD / 2 + 1.4]}><boxGeometry args={[FW + 2.2, 0.16, 0.1]} /><meshStandardMaterial color={C.fence} roughness={0.85} /></mesh>
      {([-3.0, -1.4, 1.4, 3.0] as number[]).map((px, i) => (
        <mesh key={i} position={[px, 0.16, FD / 2 + 1.4]}><boxGeometry args={[0.13, 0.32, 0.13]} /><meshStandardMaterial color={C.fence} roughness={0.8} /></mesh>
      ))}
      <mesh position={[0, -0.015, FD / 2 + 0.9]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[FW + 3.2, 2.4]} /><meshStandardMaterial color={C.sidewalk} roughness={0.92} /></mesh>
      <mesh position={[0, -0.02, FD / 2 + 2.4]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[FW + 5, 1.8]} /><meshStandardMaterial color="#888078" roughness={0.97} /></mesh>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[FW + 10, FD + 14]} /><meshStandardMaterial color={C.ground} roughness={0.95} /></mesh>
      <mesh position={[0, -0.01, -FD / 2 - 1.0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[FW + 2, 2.5]} /><meshStandardMaterial color="#3a6030" roughness={0.97} /></mesh>
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROOF MESH WITH ILLUMINATED SIGNBOARD
───────────────────────────────────────────────────────────── */

function RoofMesh({ totalFloors, pgName }: { totalFloors: number; pgName: string }) {
  const y = (totalFloors + 1) * FH + SLAB;
  const roofSignTex = useMemo(() => createRoofSignTexture(pgName), [pgName]);
  useEffect(() => () => roofSignTex.dispose(), [roofSignTex]);

  const signW = Math.min(FW * 0.76, 4.0);

  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.025, 0]}><boxGeometry args={[FW + 0.06, 0.05, FD + 0.04]} /><meshStandardMaterial color={C.roofSlab} roughness={0.88} /></mesh>
      <mesh position={[0, 0.3, FD / 2]}><boxGeometry args={[FW, 0.55, WT]} /><meshStandardMaterial color={C.parapet} roughness={0.8} /></mesh>
      <mesh position={[0, 0.3, -FD / 2]}><boxGeometry args={[FW, 0.55, WT]} /><meshStandardMaterial color={C.wallBack} roughness={0.85} /></mesh>
      <mesh position={[-FW / 2, 0.3, 0]}><boxGeometry args={[WT, 0.55, FD]} /><meshStandardMaterial color={C.wallSide} roughness={0.85} /></mesh>
      <mesh position={[FW / 2, 0.3, 0]}><boxGeometry args={[WT, 0.55, FD]} /><meshStandardMaterial color={C.wallSide} roughness={0.85} /></mesh>

      {/* Water tanks */}
      {([-1.2, 0.5] as number[]).map((tx, i) => (
        <group key={i} position={[tx, 0.06, -FD / 2 + 0.58]}>
          <mesh position={[0, 0.24, 0]}><cylinderGeometry args={[0.24, 0.24, 0.46, 12]} /><meshStandardMaterial color={C.tank} roughness={0.65} metalness={0.35} /></mesh>
          <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[0.27, 0.27, 0.04, 12]} /><meshStandardMaterial color="#1548a0" roughness={0.6} metalness={0.45} /></mesh>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.255, 0.255, 0.06, 12]} /><meshStandardMaterial color="#1e5ec0" roughness={0.6} metalness={0.5} /></mesh>
        </group>
      ))}

      <SolarPanels position={[0.6, 0.07, 0.3]} />

      {/* Crisp 3D Signboard directly on the parapet */}
      <mesh position={[0, 0.32, FD / 2 + 0.045]}>
        <boxGeometry args={[signW, 0.48, 0.04]} />
        <meshStandardMaterial
          map={roofSignTex}
          roughness={0.25}
          metalness={0.15}
        />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   CAMERA RIG (FLOOR FOCUSING)
───────────────────────────────────────────────────────────── */

interface CRP { targetFloor: number | null; totalFloors: number; }
function CameraRig({ targetFloor, totalFloors }: CRP) {
  const { camera, size, invalidate } = useThree();
  const buildingCenterY = ((totalFloors + 1) * FH + SLAB + 0.6) / 2;
  const tRef = useRef(buildingCenterY);
  const aRef = useRef(true);

  // Responsive camera distance based on viewport width & height
  const aspect = size.width / Math.max(size.height, 1);
  const totalH = (totalFloors + 1) * FH + SLAB + 0.6;
  const totalW = FW + 3.0; // Building width plus side trees

  const vFovRad = (40 * Math.PI) / 180;
  const tanFactor = 2 * Math.tan(vFovRad / 2); // ~0.728

  // Height-based distance: leaves ~19% gap at top and bottom
  const distV = (totalH * 1.38) / tanFactor;
  // Width-based distance: ensures building fits horizontally on mobile screens (iPhone SE, etc.)
  const distH = (totalW * 1.22) / (tanFactor * Math.max(aspect, 0.42));
  const idealZ = Math.max(distV, distH);

  useEffect(() => {
    tRef.current = targetFloor !== null ? targetFloor * FH + FH / 2 : buildingCenterY;
    aRef.current = true;
    invalidate();
  }, [targetFloor, buildingCenterY, invalidate]);

  // Set initial position and target immediately
  useEffect(() => {
    camera.position.set(0, tRef.current, idealZ);
    camera.lookAt(0, tRef.current, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, idealZ, invalidate]);

  useFrame(() => {
    if (!aRef.current) return;
    const tgtY = tRef.current;
    const currY = camera.position.y;
    const currZ = camera.position.z;
    const diffY = tgtY - currY;
    const diffZ = idealZ - currZ;

    if (Math.abs(diffY) > 0.002 || Math.abs(diffZ) > 0.01) {
      camera.position.y += diffY * 0.1;
      camera.position.z += diffZ * 0.1;
      camera.lookAt(0, camera.position.y, 0);
      invalidate();
    } else {
      camera.position.y = tgtY;
      camera.position.z = idealZ;
      camera.lookAt(0, tgtY, 0);
      aRef.current = false;
    }
  });

  return null;
}

/* ─────────────────────────────────────────────────────────────
   SMOOTH 3D ROTATION GROUP
───────────────────────────────────────────────────────────── */

function SmoothRotator({ rotY, children }: { rotY: number; children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;
    const curr = groupRef.current.rotation.y;
    const diff = rotY - curr;
    if (Math.abs(diff) > 0.0005) {
      groupRef.current.rotation.y += diff * 0.16;
      invalidate();
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

/* ─────────────────────────────────────────────────────────────
   SCENE WRAPPER
───────────────────────────────────────────────────────────── */

interface SP {
  pgName: string;
  totalFloors: number;
  rooms: Room[];
  activeFloor: number | null;
  filterType?: number | null;
  rotY: number;
  onFloorClick: (f: number) => void;
  onRoomClick: (r: Room) => void;
  setHovered: (v: boolean) => void;
}

function Scene({
  pgName,
  totalFloors,
  rooms,
  activeFloor,
  filterType,
  rotY,
  onFloorClick,
  onRoomClick,
  setHovered
}: SP) {
  const floors = useMemo(() => Array.from({ length: totalFloors }, (_, i) => i + 1), [totalFloors]);

  // Determine maximum columns across floors to ensure vertical alignment
  const maxCols = useMemo(() => {
    const counts = floors.map(f => rooms.filter(r => r.floor === f).length);
    return Math.min(Math.max(...counts, 2), 4);
  }, [floors, rooms]);

  return (
    <>
      <ambientLight intensity={0.75} color="#fff8f0" />
      <directionalLight position={[6, 14, 10]} intensity={2.2} color="#fffae0" />
      <directionalLight position={[-8, 8, 2]} intensity={0.5} color="#c8deff" />
      <directionalLight position={[0, -2, 5]} intensity={0.25} color="#ffeed0" />
      <pointLight position={[0, 0.7, FD / 2 + 1.6]} intensity={1.4} color="#ffa030" distance={5.5} decay={2} />
      <pointLight position={[0, (totalFloors + 1) * FH + 1.2, 0]} intensity={0.3} color="#fff0cc" distance={8} decay={2} />

      <SmoothRotator rotY={rotY}>
        <EntranceMesh />
        <Tree x={-FW / 2 - 0.9} z={FD / 2 - 0.3} s={1.1} />
        <Tree x={FW / 2 + 0.85} z={FD / 2 - 0.2} s={0.95} />
        <Tree x={-FW / 2 - 1.5} z={-0.4} s={0.8} />
        <Tree x={FW / 2 + 1.4} z={-0.5} s={0.85} />

        <EntranceLamp x={-FW / 2 + 0.08} z={FD / 2 + 0.05} side="left" />
        <EntranceLamp x={FW / 2 - 0.08} z={FD / 2 + 0.05} side="right" />

        <Car x={-FW / 2 + 0.3} z={FD / 2 + 1.35} rotY={Math.PI / 2} />
        <Bike x={FW / 2 - 0.55} z={FD / 2 + 1.05} rotY={Math.PI * 0.04} />

        {floors.map(floor => (
          <FloorMesh
            key={floor}
            floor={floor}
            rooms={rooms}
            isActive={activeFloor === floor}
            filterType={filterType}
            maxCols={maxCols}
            onFloorClick={() => onFloorClick(floor)}
            onRoomClick={onRoomClick}
            setHovered={setHovered}
          />
        ))}

        <RoofMesh totalFloors={totalFloors} pgName={pgName} />
      </SmoothRotator>

      <CameraRig targetFloor={activeFloor} totalFloors={totalFloors} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN FULL 3D EXPORT
   Handles responsive resizing & native touch scrolling
───────────────────────────────────────────────────────────── */

export default function Building3DViewR3F({
  pgName,
  totalFloors,
  rooms,
  onRoomClick,
  filterType
}: Props) {
  const [activeFloor, setActiveFloor] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [rotY, setRotY] = useState(-0.2); // ~ -11 degrees subtle 3D tilt

  const activeFloorRooms = activeFloor !== null ? rooms.filter(r => r.floor === activeFloor) : [];

  // Proportional sizing: container height increases with floors, building settles at center with equal gaps
  const canvasH = Math.min(Math.max(440, totalFloors * 76 + 180), 700);
  const buildingCenterY = ((totalFloors + 1) * FH + SLAB + 0.6) / 2;
  const initCamZ = Math.max((totalFloors + 1) * FH * 2.2 + 8.5, 18.5);

  const handleFloorClick = useCallback((floor: number) => {
    playWhoosh();
    setActiveFloor(prev => (prev === floor ? null : floor));
  }, []);

  /* ─────────────────────────────────────────────────────────────
     GESTURE RECOGNITION:
     Horizontal swipe rotates the building smoothly.
     Vertical swipe lets the browser scroll the page natively!
  ───────────────────────────────────────────────────────────── */
  const lastX = useRef(0);
  const lastY = useRef(0);
  const touchDirection = useRef<"horizontal" | "vertical" | null>(null);
  const isMouseDown = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    lastX.current = e.touches[0].clientX;
    lastY.current = e.touches[0].clientY;
    touchDirection.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    const dx = Math.abs(clientX - lastX.current);
    const dy = Math.abs(clientY - lastY.current);

    if (touchDirection.current === null && (dx > 4 || dy > 4)) {
      touchDirection.current = dx >= dy ? "horizontal" : "vertical";
    }

    if (touchDirection.current === "horizontal") {
      if (e.cancelable) e.preventDefault();
      const deltaX = clientX - lastX.current;
      setRotY(prev => prev + deltaX * 0.008);
    }
    // When vertical, we do NOT call preventDefault(), so the page scrolls natively!
    lastX.current = clientX;
    lastY.current = clientY;
  };

  const onTouchEnd = () => {
    touchDirection.current = null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isMouseDown.current = true;
    lastX.current = e.clientX;
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown.current) return;
      const deltaX = e.clientX - lastX.current;
      lastX.current = e.clientX;
      setRotY(prev => prev + deltaX * 0.008);
    };
    const onMouseUp = () => {
      isMouseDown.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        position: "relative",
        userSelect: "none",
        background: "linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #081020 100%)",
        borderRadius: "18px",
        margin: "8px 0",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.07)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "pan-y",
      }}
    >
      <div
        style={{
          width: "100%",
          height: canvasH + "px",
          cursor: hovered ? "pointer" : "grab",
          touchAction: "pan-y",
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ position: [0, buildingCenterY, initCamZ], fov: 40 }}
          gl={{ antialias: true, powerPreference: "low-power", alpha: true }}
          style={{ background: "transparent", touchAction: "pan-y" }}
          onPointerMissed={() => setHovered(false)}
        >
          <Scene
            pgName={pgName}
            totalFloors={totalFloors}
            rooms={rooms}
            activeFloor={activeFloor}
            filterType={filterType}
            rotY={rotY}
            onFloorClick={handleFloorClick}
            onRoomClick={onRoomClick}
            setHovered={setHovered}
          />
        </Canvas>
      </div>

      {/* Floor Room Selection Drawer */}
      {activeFloor !== null && (
        <>
          <div
            className={styles.panelBackdrop}
            onClick={() => {
              playWhoosh(true);
              setActiveFloor(null);
            }}
          />
          <div className={styles.floorPanel}>
            <div className={styles.panelHandle} />
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelFloorLabel}>Floor {activeFloor}</p>
                <h3 className={styles.panelTitle}>🚪 Select a Room</h3>
              </div>
              <button
                className={styles.panelClose}
                onClick={() => {
                  playWhoosh(true);
                  setActiveFloor(null);
                }}
              >
                ✕
              </button>
            </div>
            {activeFloorRooms.length === 0 ? (
              <p className={styles.emptyMsg}>No rooms on this floor.</p>
            ) : (
              <div className={styles.roomGrid}>
                {activeFloorRooms.map(room => {
                  const rc = roomColor(room),
                    free = room.beds.filter(b => !b.isOccupied).length;
                  return (
                    <button
                      key={room.id}
                      className={styles.roomCard}
                      style={{ borderColor: `${rc}44` }}
                      onClick={() => {
                        playWhoosh(true);
                        setActiveFloor(null);
                        onRoomClick(room);
                      }}
                    >
                      <div className={styles.rcHeader}>
                        <span className={styles.rcNum} style={{ color: rc }}>
                          {room.roomNumber}
                        </span>
                        <span
                          className={styles.rcShare}
                          style={{
                            background: `${rc}18`,
                            color: rc,
                            borderColor: `${rc}35`
                          }}
                        >
                          {room.sharingType}-Share
                        </span>
                      </div>
                      <div className={styles.rcBeds}>
                        {room.beds.map(bed => (
                          <div
                            key={bed.id}
                            className={styles.rcBed}
                            style={{
                              background: bedColor(bed),
                              boxShadow: `0 0 5px ${bedColor(bed)}80`
                            }}
                            title={
                              bed.isOccupied
                                ? bed.tenant?.name || "Occupied"
                                : "Free"
                            }
                          />
                        ))}
                      </div>
                      <span className={styles.rcStatus} style={{ color: rc }}>
                        {free === 0
                          ? "🔴 Full"
                          : free === room.beds.length
                          ? `🟢 ${free} free`
                          : `🟡 ${free} free`}
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
