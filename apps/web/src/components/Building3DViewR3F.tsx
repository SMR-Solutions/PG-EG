"use client";

import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
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

const FW=5.4, FD=2.2, FH=1.6, SLAB=0.08, WT=0.06;

const C = {
  wall:"#c8bfae", wallBack:"#b0a898", wallSide:"#b8af9e",
  slab:"#d4ccbc", roofSlab:"#c0b8a8", parapet:"#ccc4b4",
  ground:"#9a9488", sidewalk:"#c4beb6",
  door:"#7a5c3a", doorFrame:"#5c4428", fence:"#d8d2c8",
  tank:"#1a55aa", lamp:"#3a3630",
  tree1:"#2a6e2a", tree2:"#1e5a1e", trunk:"#6b4020",
  winFrame:"#7a7060", winGlass:"#ffa830",
  solar:"#1a2560", solarCell:"#2244bb",
};

const BED_COLORS = { occupied:"#2dc653", free:"#e63946", pending:"#f4a261" } as const;
function bedColor(bed: Bed) {
  if (!bed.isOccupied) return BED_COLORS.free;
  return bed.tenant?.rent?.status==="pending" ? BED_COLORS.pending : BED_COLORS.occupied;
}
function roomColor(room: Room) {
  const free=room.beds.filter(b=>!b.isOccupied).length;
  if (room.beds.length===0) return "#888";
  if (free===0) return BED_COLORS.occupied;
  if (free<room.beds.length) return BED_COLORS.pending;
  return BED_COLORS.free;
}
function floorStatusColor(floorRooms: Room[]) {
  const beds=floorRooms.flatMap(r=>r.beds);
  if (!beds.length) return "#888";
  const free=beds.filter(b=>!b.isOccupied).length;
  if (free===0) return BED_COLORS.occupied;
  if (free/beds.length<=0.35) return BED_COLORS.pending;
  return BED_COLORS.free;
}
function playWhoosh(short=false) {
  try {
    const ac=new AudioContext(),dur=short?0.18:0.32;
    const buf=ac.createBuffer(1,Math.ceil(ac.sampleRate*dur),ac.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const src=ac.createBufferSource(); src.buffer=buf;
    const f=ac.createBiquadFilter(); f.type="lowpass";
    f.frequency.setValueAtTime(short?2800:1800,ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(short?400:180,ac.currentTime+dur);
    const g=ac.createGain();
    g.gain.setValueAtTime(0,ac.currentTime);
    g.gain.linearRampToValueAtTime(short?0.16:0.22,ac.currentTime+0.03);
    g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+dur);
    src.connect(f);f.connect(g);g.connect(ac.destination);
    src.start();src.stop(ac.currentTime+dur+0.01);
  } catch {}
}

function Tree({x,z,s=1}:{x:number;z:number;s?:number}) {
  return (
    <group position={[x,0,z]}>
      <mesh position={[0,0.55*s,0]}><cylinderGeometry args={[0.07*s,0.1*s,1.1*s,7]}/><meshStandardMaterial color={C.trunk} roughness={0.95}/></mesh>
      <mesh position={[0,1.45*s,0]}><sphereGeometry args={[0.42*s,9,7]}/><meshStandardMaterial color={C.tree1} roughness={0.9}/></mesh>
      <mesh position={[0.18*s,1.72*s,0.1*s]}><sphereGeometry args={[0.28*s,8,6]}/><meshStandardMaterial color={C.tree2} roughness={0.88}/></mesh>
      <mesh position={[-0.14*s,1.65*s,-0.1*s]}><sphereGeometry args={[0.24*s,8,6]}/><meshStandardMaterial color={C.tree1} roughness={0.9}/></mesh>
      <mesh position={[0,1.95*s,0]}><sphereGeometry args={[0.18*s,7,5]}/><meshStandardMaterial color={C.tree2} roughness={0.85}/></mesh>
    </group>
  );
}

// Entrance corner lamp — arm bends inward toward door
function EntranceLamp({x,z,side}:{x:number;z:number;side:"left"|"right"}) {
  const dir=side==="left"?1:-1; // arm direction: left lamp points right, right lamp points left
  return (
    <group position={[x,0,z]}>
      {/* Pole */}
      <mesh position={[0,1.4,0]}><cylinderGeometry args={[0.04,0.055,2.8,7]}/><meshStandardMaterial color={C.lamp} roughness={0.65} metalness={0.55}/></mesh>
      {/* Horizontal arm pointing inward */}
      <mesh position={[dir*0.32,2.76,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[0.022,0.022,0.64,5]}/><meshStandardMaterial color={C.lamp} roughness={0.65} metalness={0.55}/></mesh>
      {/* Lamp shade */}
      <mesh position={[dir*0.64,2.7,0]} rotation={[0,0,dir*-0.3]}><cylinderGeometry args={[0.055,0.12,0.18,8]}/><meshStandardMaterial color="#222228" roughness={0.5} metalness={0.4}/></mesh>
      {/* Bulb */}
      <mesh position={[dir*0.64,2.76,0]}><sphereGeometry args={[0.065,8,6]}/><meshStandardMaterial color="#fff8d0" emissive={new THREE.Color("#ffcc50")} emissiveIntensity={2.6} roughness={0.15}/></mesh>
      {/* Point light directed toward entrance */}
      <pointLight position={[dir*0.64,2.5,0.6]} intensity={2.2} color="#ffbb30" distance={5.5} decay={2}/>
    </group>
  );
}

// SUV-style car matching reference image (teal/slate color, SUV proportions)
function Car({x,z,rotY=0}:{x:number;z:number;rotY?:number}) {
  const body="#3a7a8a", dark="#2a5a68", glass="#7aaabb";
  return (
    <group position={[x,0,z]} rotation={[0,rotY,0]}>
      {/* Lower body / sills */}
      <mesh position={[0,0.18,0]}><boxGeometry args={[1.02,0.26,2.1]}/><meshStandardMaterial color={body} roughness={0.28} metalness={0.42}/></mesh>
      {/* Upper cabin */}
      <mesh position={[0,0.42,-0.08]}><boxGeometry args={[0.9,0.3,1.22]}/><meshStandardMaterial color={body} roughness={0.28} metalness={0.4}/></mesh>
      {/* Hood slope */}
      <mesh position={[0,0.3,0.72]}><boxGeometry args={[0.96,0.14,0.44]}/><meshStandardMaterial color={body} roughness={0.3} metalness={0.4}/></mesh>
      {/* Rear hatch */}
      <mesh position={[0,0.3,-0.82]}><boxGeometry args={[0.96,0.14,0.34]}/><meshStandardMaterial color={body} roughness={0.3} metalness={0.4}/></mesh>
      {/* Roof */}
      <mesh position={[0,0.57,-0.06]}><boxGeometry args={[0.87,0.08,1.18]}/><meshStandardMaterial color={body} roughness={0.28} metalness={0.4}/></mesh>
      {/* Roof rack bars */}
      {[-0.2,0.2].map((rz,i)=><mesh key={i} position={[0,0.615,rz]}><boxGeometry args={[0.88,0.018,0.045]}/><meshStandardMaterial color="#888890" roughness={0.4} metalness={0.7}/></mesh>)}
      {/* Windshield */}
      <mesh position={[0,0.46,0.53]}><boxGeometry args={[0.84,0.28,0.065]}/><meshStandardMaterial color={glass} roughness={0.05} metalness={0.1} transparent opacity={0.68}/></mesh>
      {/* Rear windshield */}
      <mesh position={[0,0.46,-0.68]}><boxGeometry args={[0.82,0.26,0.06]}/><meshStandardMaterial color={glass} roughness={0.05} transparent opacity={0.62}/></mesh>
      {/* Side windows */}
      {([-0.46,0.46] as number[]).map((sx,i)=><mesh key={i} position={[sx,0.45,-0.06]}><boxGeometry args={[0.05,0.22,1.0]}/><meshStandardMaterial color={glass} roughness={0.05} transparent opacity={0.58}/></mesh>)}
      {/* Door pillars (A/B/C) */}
      {([-0.46,0.46] as number[]).flatMap((sx,si)=>([0.52,-0.06,-0.6] as number[]).map((pz,pi)=><mesh key={si+"-"+pi} position={[sx,0.42,pz]}><boxGeometry args={[0.05,0.3,0.06]}/><meshStandardMaterial color={dark} roughness={0.4} metalness={0.3}/></mesh>))}
      {/* Headlights (full width style) */}
      {([-0.36,0.36] as number[]).map((hx,i)=><mesh key={i} position={[hx,0.22,1.07]}><boxGeometry args={[0.24,0.1,0.05]}/><meshStandardMaterial color="#d8f0ff" emissive={new THREE.Color("#aaddff")} emissiveIntensity={0.5} roughness={0.1}/></mesh>)}
      {/* DRL strip */}
      <mesh position={[0,0.29,1.07]}><boxGeometry args={[0.88,0.03,0.04]}/><meshStandardMaterial color="#ffffff" emissive={new THREE.Color("#ffffff")} emissiveIntensity={0.6} roughness={0.15}/></mesh>
      {/* Tail lights */}
      {([-0.38,0.38] as number[]).map((tx,i)=><mesh key={i} position={[tx,0.26,-1.07]}><boxGeometry args={[0.2,0.1,0.04]}/><meshStandardMaterial color="#cc1111" emissive={new THREE.Color("#cc1111")} emissiveIntensity={0.9} roughness={0.2}/></mesh>)}
      {/* Bumpers */}
      <mesh position={[0,0.16,1.07]}><boxGeometry args={[0.94,0.16,0.065]}/><meshStandardMaterial color={dark} roughness={0.5} metalness={0.25}/></mesh>
      <mesh position={[0,0.16,-1.07]}><boxGeometry args={[0.94,0.16,0.065]}/><meshStandardMaterial color={dark} roughness={0.5} metalness={0.25}/></mesh>
      {/* Door handles */}
      {([-0.48,0.48] as number[]).flatMap((sx,si)=>([-0.1,0.35] as number[]).map((hz,hi)=><mesh key={si+"-"+hi} position={[sx,0.38,hz]}><boxGeometry args={[0.045,0.028,0.16]}/><meshStandardMaterial color="#c8bea8" roughness={0.3} metalness={0.7}/></mesh>))}
      {/* Side mirrors */}
      {([-0.5,0.5] as number[]).map((sx,i)=><mesh key={i} position={[sx,0.48,0.44]}><boxGeometry args={[0.065,0.065,0.13]}/><meshStandardMaterial color={dark} roughness={0.35} metalness={0.35}/></mesh>)}
      {/* Wheels — 4 corners */}
      {([-0.5,0.5] as number[]).flatMap((wx,wi)=>([-0.72,0.72] as number[]).map((wz,wzi)=>(
        <group key={wi+"-"+wzi} position={[wx,0.145,wz]}>
          {/* Tyre */}
          <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[0.145,0.145,0.12,14]}/><meshStandardMaterial color="#181818" roughness={0.92}/></mesh>
          {/* Rim */}
          <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[0.095,0.095,0.125,12]}/><meshStandardMaterial color="#a0a0b0" roughness={0.25} metalness={0.75}/></mesh>
          {/* Spokes x5 */}
          {Array.from({length:5},(_,si)=>(
            <mesh key={si} rotation={[Math.PI/2,si*Math.PI/5,0]}>
              <boxGeometry args={[0.012,0.145,0.012]}/>
              <meshStandardMaterial color="#b8b8c8" roughness={0.3} metalness={0.7}/>
            </mesh>
          ))}
          {/* Hub */}
          <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[0.03,0.03,0.13,7]}/><meshStandardMaterial color="#888890" roughness={0.3} metalness={0.7}/></mesh>
        </group>
      )))}
    </group>
  );
}

// Sport naked bike matching reference — blue body, yellow-green rims, gold forks
function Bike({x,z,rotY=0}:{x:number;z:number;rotY?:number}) {
  const bBlue="#2288cc", rim="#aacc00", fork="#c8a020";
  return (
    <group position={[x,0,z]} rotation={[0,rotY,0]}>
      {/* Engine/frame block */}
      <mesh position={[0,0.25,0.02]}><boxGeometry args={[0.16,0.22,0.52]}/><meshStandardMaterial color="#222228" roughness={0.55} metalness={0.45}/></mesh>
      {/* Fuel tank — blue */}
      <mesh position={[0,0.38,0.16]}><boxGeometry args={[0.15,0.14,0.3]}/><meshStandardMaterial color={bBlue} roughness={0.28} metalness={0.32}/></mesh>
      {/* Side fairing left */}
      <mesh position={[-0.09,0.28,0.04]}><boxGeometry args={[0.04,0.18,0.44]}/><meshStandardMaterial color={bBlue} roughness={0.3} metalness={0.28}/></mesh>
      {/* Side fairing right */}
      <mesh position={[0.09,0.28,0.04]}><boxGeometry args={[0.04,0.18,0.44]}/><meshStandardMaterial color={bBlue} roughness={0.3} metalness={0.28}/></mesh>
      {/* Seat */}
      <mesh position={[0,0.4,-0.16]}><boxGeometry args={[0.13,0.055,0.38]}/><meshStandardMaterial color="#111" roughness={0.88}/></mesh>
      {/* Tail section — blue */}
      <mesh position={[0,0.34,-0.41]}><boxGeometry args={[0.11,0.08,0.2]}/><meshStandardMaterial color={bBlue} roughness={0.3} metalness={0.28}/></mesh>
      {/* Tail light */}
      <mesh position={[0,0.3,-0.51]}><boxGeometry args={[0.08,0.04,0.03]}/><meshStandardMaterial color="#cc1111" emissive={new THREE.Color("#cc1111")} emissiveIntensity={0.9} roughness={0.2}/></mesh>
      {/* Front forks — gold */}
      <mesh position={[0.035,0.24,0.46]} rotation={[0.18,0,0]}><cylinderGeometry args={[0.022,0.026,0.52,6]}/><meshStandardMaterial color={fork} roughness={0.28} metalness={0.72}/></mesh>
      <mesh position={[-0.035,0.24,0.46]} rotation={[0.18,0,0]}><cylinderGeometry args={[0.022,0.026,0.52,6]}/><meshStandardMaterial color={fork} roughness={0.28} metalness={0.72}/></mesh>
      {/* Fork brace */}
      <mesh position={[0,0.14,0.51]}><boxGeometry args={[0.12,0.035,0.04]}/><meshStandardMaterial color="#333" roughness={0.5} metalness={0.5}/></mesh>
      {/* Handlebars */}
      <mesh position={[0,0.46,0.34]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[0.018,0.018,0.36,6]}/><meshStandardMaterial color="#333" roughness={0.4} metalness={0.7}/></mesh>
      {/* Grip ends */}
      {([-0.18,0.18] as number[]).map((gx,i)=><mesh key={i} position={[gx,0.46,0.34]}><boxGeometry args={[0.025,0.04,0.06]}/><meshStandardMaterial color="#111" roughness={0.85}/></mesh>)}
      {/* Headlight cluster */}
      <mesh position={[0,0.37,0.5]}><boxGeometry args={[0.13,0.11,0.06]}/><meshStandardMaterial color="#111" roughness={0.4} metalness={0.4}/></mesh>
      <mesh position={[0,0.37,0.535]}><boxGeometry args={[0.09,0.075,0.03]}/><meshStandardMaterial color="#d8f8ff" emissive={new THREE.Color("#88ddff")} emissiveIntensity={0.7} roughness={0.1}/></mesh>
      {/* Exhaust pipe */}
      <mesh position={[0.1,0.2,-0.24]} rotation={[0.07,0,0]}><cylinderGeometry args={[0.025,0.032,0.58,7]}/><meshStandardMaterial color="#888890" roughness={0.4} metalness={0.65}/></mesh>
      {/* Exhaust tip */}
      <mesh position={[0.1,0.17,-0.51]}><cylinderGeometry args={[0.034,0.026,0.1,7]}/><meshStandardMaterial color="#aaaaaa" roughness={0.3} metalness={0.72}/></mesh>
      {/* Front wheel */}
      <group position={[0,0.135,0.55]}>
        <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.135,0.135,0.1,14]}/><meshStandardMaterial color="#0f0f0f" roughness={0.9}/></mesh>
        <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.082,0.082,0.105,10]}/><meshStandardMaterial color={rim} roughness={0.3} metalness={0.5}/></mesh>
        {Array.from({length:6},(_,si)=><mesh key={si} rotation={[Math.PI/2,0,si*Math.PI/6]}><boxGeometry args={[0.01,0.118,0.01]}/><meshStandardMaterial color={rim} roughness={0.3} metalness={0.5}/></mesh>)}
        {/* Brake disc */}
        <mesh position={[0.053,0,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.09,0.09,0.01,10]}/><meshStandardMaterial color="#888" roughness={0.4} metalness={0.65}/></mesh>
      </group>
      {/* Rear wheel */}
      <group position={[0,0.135,-0.5]}>
        <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.135,0.135,0.11,14]}/><meshStandardMaterial color="#0f0f0f" roughness={0.9}/></mesh>
        <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.084,0.084,0.115,10]}/><meshStandardMaterial color={rim} roughness={0.3} metalness={0.5}/></mesh>
        {Array.from({length:6},(_,si)=><mesh key={si} rotation={[Math.PI/2,0,si*Math.PI/6]}><boxGeometry args={[0.01,0.118,0.01]}/><meshStandardMaterial color={rim} roughness={0.3} metalness={0.5}/></mesh>)}
        {/* Chain guard */}
        <mesh position={[-0.06,0.04,0.02]}><boxGeometry args={[0.01,0.06,0.2]}/><meshStandardMaterial color="#333" roughness={0.6} metalness={0.3}/></mesh>
      </group>
    </group>
  );
}

function SolarPanels({position}:{position:[number,number,number]}) {
  const pW=0.64,pD=0.38,gap=0.07;
  return (
    <group position={position} rotation={[-0.22,0,0]}>
      {[0,1].map(r=>[0,1,2].map(c=>(
        <group key={r+"-"+c} position={[c*(pW+gap)-(2*(pW+gap)/2),r*(pD+gap)*0.82,r*(pD+gap)*0.48]}>
          <mesh><boxGeometry args={[pW,0.022,pD]}/><meshStandardMaterial color={C.solar} roughness={0.28} metalness={0.42}/></mesh>
          {[0,1,2].map(cx=>[0,1].map(cy=>(
            <mesh key={cx+"-"+cy} position={[(cx-1)*(pW/3),0.016,(cy-0.5)*(pD/2)]}>
              <boxGeometry args={[pW/3-0.025,0.012,pD/2-0.025]}/>
              <meshStandardMaterial color={C.solarCell} roughness={0.2} metalness={0.5} emissive={new THREE.Color("#001144")} emissiveIntensity={0.35}/>
            </mesh>
          )))}
          <mesh position={[0,0,-(pD/2)]}><boxGeometry args={[pW+0.025,0.03,0.022]}/><meshStandardMaterial color="#666670" roughness={0.5} metalness={0.65}/></mesh>
          <mesh position={[0,0,(pD/2)]}><boxGeometry args={[pW+0.025,0.03,0.022]}/><meshStandardMaterial color="#666670" roughness={0.5} metalness={0.65}/></mesh>
          <mesh position={[-(pW/2),0,0]}><boxGeometry args={[0.022,0.03,pD+0.025]}/><meshStandardMaterial color="#666670" roughness={0.5} metalness={0.65}/></mesh>
          <mesh position={[(pW/2),0,0]}><boxGeometry args={[0.022,0.03,pD+0.025]}/><meshStandardMaterial color="#666670" roughness={0.5} metalness={0.65}/></mesh>
        </group>
      )))}
    </group>
  );
}

function BalconyRailing({y,dimmed}:{y:number;dimmed:boolean}) {
  const alpha=dimmed?0.15:0.88, posts=8;
  return (
    <group position={[0,y,FD/2+0.02]}>
      <mesh position={[0,0.13,0]}><boxGeometry args={[FW+0.06,0.04,0.04]}/><meshStandardMaterial color={C.fence} roughness={0.7} transparent opacity={alpha}/></mesh>
      <mesh position={[0,0.03,0]}><boxGeometry args={[FW+0.04,0.025,0.03]}/><meshStandardMaterial color={C.fence} roughness={0.7} transparent opacity={alpha}/></mesh>
      {Array.from({length:posts},(_,i)=>{
        const bx=-FW/2+0.3+i*(FW*0.88/(posts-1));
        return <mesh key={i} position={[bx,0.07,0]}><boxGeometry args={[0.025,0.1,0.025]}/><meshStandardMaterial color="#e8e2d8" roughness={0.75} transparent opacity={alpha}/></mesh>;
      })}
    </group>
  );
}

interface FMP{floor:number;rooms:Room[];isActive:boolean;filterType?:number|null;onFloorClick:()=>void;onRoomClick:(r:Room)=>void;setHovered:(v:boolean)=>void;}
function FloorMesh({floor,rooms,isActive,filterType,onFloorClick,onRoomClick,setHovered}:FMP) {
  const {invalidate}=useThree();
  const floorRooms=rooms.filter(r=>r.floor===floor);
  const fc=floorStatusColor(floorRooms);
  const isFloorDimmed=!!filterType&&!floorRooms.some(r=>r.sharingType===filterType);
  const isFloorHighlighted=!!filterType&&floorRooms.some(r=>r.sharingType===filterType);
  const y=floor*FH, alpha=isFloorDimmed?0.28:1;  // floor 1 starts at FH, above the entrance level
  const FL_W=0.62, roomStart=-FW/2+FL_W+0.1, roomEnd=FW/2-0.12, roomAreaW=roomEnd-roomStart;
  const maxR=Math.max(floorRooms.length,1), winSp=roomAreaW/maxR;
  const winW=Math.min(winSp*0.60,0.86), winH=FH*0.52;
  const allBeds=floorRooms.flatMap(r=>r.beds), showBeds=allBeds.slice(0,6), bedSZ=FD*0.68;

  return (
    <group position={[0,y,0]}>
      {/* slab */}
      <mesh position={[0,0,0]}><boxGeometry args={[FW+0.06,SLAB,FD+0.04]}/><meshStandardMaterial color={C.slab} roughness={0.85} transparent opacity={alpha}/></mesh>
      {/* front wall */}
      <mesh position={[0,FH/2+SLAB,FD/2]}
        onClick={e=>{e.stopPropagation();onFloorClick();invalidate();}}
        onPointerEnter={e=>{e.stopPropagation();setHovered(true);}}
        onPointerLeave={()=>setHovered(false)}>
        <boxGeometry args={[FW,FH,WT]}/>
        <meshStandardMaterial color={isActive?"#d4cabc":C.wall} roughness={0.78}
          emissive={isActive?new THREE.Color(fc):isFloorHighlighted?new THREE.Color(fc):new THREE.Color(0,0,0)}
          emissiveIntensity={isActive?0.12:isFloorHighlighted?0.06:0} transparent opacity={alpha}/>
      </mesh>
      {/* back wall */}
      <mesh position={[0,FH/2+SLAB,-FD/2]}><boxGeometry args={[FW,FH,WT]}/><meshStandardMaterial color={C.wallBack} roughness={0.85} transparent opacity={alpha*0.9}/></mesh>
      {/* LEFT wall — semi-transparent for bed visibility */}
      <mesh position={[-FW/2,FH/2+SLAB,0]}><boxGeometry args={[WT,FH,FD]}/><meshStandardMaterial color={C.wallSide} roughness={0.82} transparent opacity={alpha*0.25}/></mesh>
      {/* Bed silhouettes on left side */}
      {showBeds.map((bed,bi)=>{
        const bc=bedColor(bed);
        const bz=showBeds.length>1?-bedSZ/2+(bi/(showBeds.length-1))*bedSZ:0;
        return (
          <group key={bed.id} position={[-FW/2+0.1,SLAB,bz]}>
            {/* Bed frame sides (wood — seen as thin strips from left) */}
            {([-0.015,0.015] as number[]).map((px,pi)=>(
              <mesh key={pi} position={[px,0.06,0]}>
                <boxGeometry args={[0.016,0.1,0.5]}/>
                <meshStandardMaterial color="#7a4520" roughness={0.7} transparent opacity={isFloorDimmed?0.1:0.88}/>
              </mesh>
            ))}
            {/* Corner posts — 4 corners */}
            {([-0.016,0.016] as number[]).flatMap((px,pi)=>(
              ([-0.25,0.25] as number[]).map((pz,pzi)=>(
                <mesh key={pi+"-"+pzi} position={[px,0.1,pz]}>
                  <boxGeometry args={[0.022,0.2,0.022]}/>
                  <meshStandardMaterial color="#7a4520" roughness={0.65} transparent opacity={isFloorDimmed?0.1:0.9}/>
                </mesh>
              ))
            ))}
            {/* Headboard — tall arch at back */}
            <mesh position={[0,0.19,-0.25]}>
              <boxGeometry args={[0.04,0.26,0.06]}/>
              <meshStandardMaterial color="#6a3818" roughness={0.6} transparent opacity={isFloorDimmed?0.1:0.9}/>
            </mesh>
            {/* Headboard inner panel */}
            <mesh position={[0,0.2,-0.248]}>
              <boxGeometry args={[0.038,0.18,0.032]}/>
              <meshStandardMaterial color="#8a5028" roughness={0.68} transparent opacity={isFloorDimmed?0.08:0.75}/>
            </mesh>
            {/* Footboard — shorter */}
            <mesh position={[0,0.12,0.25]}>
              <boxGeometry args={[0.04,0.14,0.055]}/>
              <meshStandardMaterial color="#6a3818" roughness={0.6} transparent opacity={isFloorDimmed?0.1:0.9}/>
            </mesh>
            {/* Mattress / sheet */}
            <mesh position={[0,0.1,0]}>
              <boxGeometry args={[0.038,0.075,0.48]}/>
              <meshStandardMaterial color="#f0ece0" roughness={0.8} transparent opacity={isFloorDimmed?0.08:0.9}/>
            </mesh>
            {/* Blanket — occupancy color */}
            <mesh position={[0,0.14,0.06]}>
              <boxGeometry args={[0.04,0.04,0.32]}/>
              <meshStandardMaterial color={bc} emissive={new THREE.Color(bc)} emissiveIntensity={0.28} roughness={0.75} transparent opacity={isFloorDimmed?0.1:0.88}/>
            </mesh>
            {/* Pillow */}
            <mesh position={[0,0.16,-0.18]}>
              <boxGeometry args={[0.035,0.055,0.12]}/>
              <meshStandardMaterial color="#f8f4ec" roughness={0.78} transparent opacity={isFloorDimmed?0.08:0.88}/>
            </mesh>
          </group>
        );
      })}
      {/* right wall */}
      <mesh position={[FW/2,FH/2+SLAB,0]}><boxGeometry args={[WT,FH,FD]}/><meshStandardMaterial color={C.wallSide} roughness={0.82} transparent opacity={alpha*0.8}/></mesh>
      {/* right side windows */}
      {([0.5,-0.3] as number[]).map((tz,i)=>(
        <group key={i}>
          <mesh position={[FW/2+0.02,FH/2+SLAB,tz]}><boxGeometry args={[0.03,FH*0.44,0.28]}/><meshStandardMaterial color={C.winFrame} roughness={0.8} transparent opacity={isFloorDimmed?0.1:0.85}/></mesh>
          <mesh position={[FW/2+0.03,FH/2+SLAB,tz]}><boxGeometry args={[0.025,FH*0.38,0.22]}/><meshStandardMaterial color={C.winGlass} emissive={new THREE.Color("#ff8800")} emissiveIntensity={isFloorDimmed?0.02:0.38} roughness={0.22} transparent opacity={isFloorDimmed?0.08:0.72}/></mesh>
        </group>
      ))}
      {/* FL-X sign */}
      <mesh position={[-FW/2+FL_W/2+0.04,FH/2+SLAB,FD/2+0.018]}><boxGeometry args={[FL_W,FH*0.70,0.028]}/><meshStandardMaterial color="#0d1820" roughness={0.7}/></mesh>
      <Html position={[-FW/2+FL_W/2+0.04,FH/2+SLAB,FD/2+0.038]} center transform occlude zIndexRange={[0,10]} style={{pointerEvents:"none"}}>
        <div style={{fontSize:"15px",fontWeight:900,color:fc,textShadow:`0 0 6px ${fc}`,letterSpacing:"0.06em",fontFamily:"system-ui,sans-serif",whiteSpace:"nowrap",lineHeight:1}}>FL-{floor}</div>
      </Html>
      {/* Room windows */}
      {floorRooms.slice(0,6).map((room,i)=>{
        const rc=roomColor(room);
        const wx=roomStart+winSp*i+winSp/2;
        const signBg=rc===BED_COLORS.occupied?"rgba(8,38,8,0.93)":rc===BED_COLORS.pending?"rgba(48,28,0,0.93)":"rgba(48,8,8,0.93)";
        return (
          <group key={room.id}>
            <mesh position={[wx,FH/2+SLAB,FD/2+0.018]}><boxGeometry args={[winW+0.09,winH+0.12,0.03]}/><meshStandardMaterial color={C.winFrame} roughness={0.75} transparent opacity={isFloorDimmed?0.2:1}/></mesh>
            <mesh position={[wx,FH/2+SLAB,FD/2+0.036]}
              onClick={e=>{e.stopPropagation();playWhoosh(true);onRoomClick(room);invalidate();}}
              onPointerEnter={e=>{e.stopPropagation();setHovered(true);}}
              onPointerLeave={()=>setHovered(false)}>
              <boxGeometry args={[winW,winH,0.04]}/>
              <meshStandardMaterial color={C.winGlass} emissive={new THREE.Color("#ff8800")} emissiveIntensity={isFloorDimmed?0.04:0.5} roughness={0.18} transparent opacity={isFloorDimmed?0.2:0.82}/>
            </mesh>
            {!isFloorDimmed&&(
              <Html position={[wx,FH/2+SLAB,FD/2+0.06]} center transform occlude zIndexRange={[0,10]} style={{pointerEvents:"none"}}>
                <div style={{background:signBg,border:`1.5px solid ${rc}`,borderRadius:"5px",padding:"3px 7px",boxShadow:`0 0 8px ${rc}55`}}>
                  <span style={{fontSize:"15px",fontWeight:900,color:rc,letterSpacing:"0.05em",whiteSpace:"nowrap",fontFamily:"system-ui,sans-serif"}}>{room.roomNumber}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
      <BalconyRailing y={SLAB} dimmed={isFloorDimmed}/>
      {isActive&&<mesh position={[0,FH/2+SLAB,FD/2+0.055]}><boxGeometry args={[FW+0.08,FH+0.08,0.008]}/><meshStandardMaterial color={fc} emissive={new THREE.Color(fc)} emissiveIntensity={1.6} transparent opacity={0.5}/></mesh>}
    </group>
  );
}

function EntranceMesh({totalFloors}:{totalFloors:number}) {
  return (
    <group>
      <mesh position={[0,0,0]}><boxGeometry args={[FW+0.06,SLAB,FD+0.04]}/><meshStandardMaterial color={C.slab} roughness={0.85}/></mesh>
      <mesh position={[0,0.22,FD/2]}><boxGeometry args={[FW,0.44,WT]}/><meshStandardMaterial color={C.wall} roughness={0.8}/></mesh>
      <mesh position={[-FW/2+0.35,0.22,FD/2+0.018]}><boxGeometry args={[0.62,0.44*0.70,0.028]}/><meshStandardMaterial color="#0d1820" roughness={0.7}/></mesh>
      <Html position={[-FW/2+0.35,0.22,FD/2+0.038]} center transform occlude zIndexRange={[0,10]} style={{pointerEvents:"none"}}>
        <div style={{textAlign:"center",lineHeight:1}}>
          <div style={{fontSize:"6px",fontWeight:900,color:"rgba(255,255,255,0.4)",letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif",marginBottom:"2px"}}>FLOOR</div>
          <div style={{fontSize:"11px",fontWeight:900,color:"#ffc04a",textShadow:"0 0 8px #ffc04a",letterSpacing:"0.04em",fontFamily:"system-ui,sans-serif"}}>G</div>
        </div>
      </Html>
      <mesh position={[0,0.2,FD/2+0.018]}><boxGeometry args={[1.06,0.42,0.03]}/><meshStandardMaterial color={C.doorFrame} roughness={0.8}/></mesh>
      {([-0.26,0.26] as number[]).map((dx,i)=><mesh key={i} position={[dx,0.18,FD/2+0.032]}><boxGeometry args={[0.48,0.38,0.035]}/><meshStandardMaterial color={C.door} roughness={0.65} metalness={0.05}/></mesh>)}
      {([-0.04,0.04] as number[]).map((dx,i)=><mesh key={i} position={[dx,0.18,FD/2+0.052]}><sphereGeometry args={[0.025,7,5]}/><meshStandardMaterial color="#d4a840" roughness={0.3} metalness={0.7}/></mesh>)}
      {([0,1,2] as number[]).map(s=><mesh key={s} position={[0,s*0.038-0.018,FD/2+0.1+s*0.07]}><boxGeometry args={[FW*0.42,0.038,0.14]}/><meshStandardMaterial color={C.slab} roughness={0.9}/></mesh>)}
      <mesh position={[-FW/2,0.22,0]}><boxGeometry args={[WT,0.44,FD]}/><meshStandardMaterial color={C.wallSide} roughness={0.82}/></mesh>
      <mesh position={[FW/2,0.22,0]}><boxGeometry args={[WT,0.44,FD]}/><meshStandardMaterial color={C.wallSide} roughness={0.82}/></mesh>
      <mesh position={[0,0.08,FD/2+1.4]}><boxGeometry args={[FW+2.2,0.16,0.1]}/><meshStandardMaterial color={C.fence} roughness={0.85}/></mesh>
      {([-3.0,-1.4,1.4,3.0] as number[]).map((px,i)=><mesh key={i} position={[px,0.16,FD/2+1.4]}><boxGeometry args={[0.13,0.32,0.13]}/><meshStandardMaterial color={C.fence} roughness={0.8}/></mesh>)}
      <mesh position={[0,-0.015,FD/2+0.9]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[FW+3.2,2.4]}/><meshStandardMaterial color={C.sidewalk} roughness={0.92}/></mesh>
      <mesh position={[0,-0.02,FD/2+2.4]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[FW+5,1.8]}/><meshStandardMaterial color="#888078" roughness={0.97}/></mesh>
      <mesh position={[0,-0.02,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[FW+10,FD+14]}/><meshStandardMaterial color={C.ground} roughness={0.95}/></mesh>
      <mesh position={[0,-0.01,-FD/2-1.0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[FW+2,2.5]}/><meshStandardMaterial color="#3a6030" roughness={0.97}/></mesh>
    </group>
  );
}

function RoofMesh({totalFloors,pgName}:{totalFloors:number;pgName:string}) {
  const y=(totalFloors+1)*FH+SLAB;  // +1 to account for the entrance ground floor
  return (
    <group position={[0,y,0]}>
      <mesh position={[0,0.025,0]}><boxGeometry args={[FW+0.06,0.05,FD+0.04]}/><meshStandardMaterial color={C.roofSlab} roughness={0.88}/></mesh>
      <mesh position={[0,0.26,FD/2]}><boxGeometry args={[FW,0.46,WT]}/><meshStandardMaterial color={C.parapet} roughness={0.8}/></mesh>
      <mesh position={[0,0.26,-FD/2]}><boxGeometry args={[FW,0.46,WT]}/><meshStandardMaterial color={C.wallBack} roughness={0.85}/></mesh>
      <mesh position={[-FW/2,0.26,0]}><boxGeometry args={[WT,0.46,FD]}/><meshStandardMaterial color={C.wallSide} roughness={0.85}/></mesh>
      <mesh position={[FW/2,0.26,0]}><boxGeometry args={[WT,0.46,FD]}/><meshStandardMaterial color={C.wallSide} roughness={0.85}/></mesh>
      {([-1.2,0.5] as number[]).map((tx,i)=>(
        <group key={i} position={[tx,0.06,-FD/2+0.58]}>
          <mesh position={[0,0.24,0]}><cylinderGeometry args={[0.24,0.24,0.46,12]}/><meshStandardMaterial color={C.tank} roughness={0.65} metalness={0.35}/></mesh>
          <mesh position={[0,0.48,0]}><cylinderGeometry args={[0.27,0.27,0.04,12]}/><meshStandardMaterial color="#1548a0" roughness={0.6} metalness={0.45}/></mesh>
          <mesh position={[0,0,0]}><cylinderGeometry args={[0.04,0.04,0.2,6]}/><meshStandardMaterial color="#0e3070" roughness={0.8} metalness={0.3}/></mesh>
          <mesh position={[0,0.3,0]}><cylinderGeometry args={[0.255,0.255,0.06,12]}/><meshStandardMaterial color="#1e5ec0" roughness={0.6} metalness={0.5}/></mesh>
        </group>
      ))}
      <SolarPanels position={[0.6,0.07,0.3]}/>
      <Html position={[0,0.26,FD/2+0.08]} center transform occlude zIndexRange={[0,10]} style={{pointerEvents:"none"}}>
        <span style={{
          background:"rgba(255,255,255,0.97)",
          color:"#111",
          fontSize:"16px",
          fontWeight:900,
          padding:"5px 28px",
          borderRadius:"6px",
          boxShadow:"0 2px 14px rgba(0,0,0,0.5)",
          whiteSpace:"nowrap",
          letterSpacing:"0.04em",
          fontFamily:"system-ui,sans-serif",
          border:"1px solid rgba(0,0,0,0.08)",
          display:"block",
          minWidth:"200px",
          textAlign:"center",
        }}>{pgName}</span>
      </Html>
    </group>
  );
}

interface CRP{targetFloor:number|null;totalFloors:number;}
function CameraRig({targetFloor,totalFloors}:CRP) {
  const {camera,invalidate}=useThree();
  const tRef=useRef(totalFloors*FH*0.5);
  const aRef=useRef(false);
  useEffect(()=>{tRef.current=targetFloor!==null?targetFloor*FH+FH/2:(totalFloors+1)*FH*0.5;aRef.current=true;invalidate();},[targetFloor,totalFloors,invalidate]);
  useFrame(()=>{
    if(!aRef.current)return;
    const curr=camera.position.y,tgt=tRef.current,next=curr+(tgt-curr)*0.07;
    camera.position.y=next;
    if(Math.abs(next-tgt)<0.004){camera.position.y=tgt;aRef.current=false;}
    else invalidate();
  });
  return null;
}

/**
 * TouchDirectionRouter — attached directly on the canvas wrapper div.
 * Detects swipe direction on first move after touchstart:
 *   - Vertical swipe  → scroll the page (don't pass to OrbitControls)
 *   - Horizontal swipe → OrbitControls handles azimuth rotation
 * Works on mobile (touch) + desktop (wheel/pointer).
 */
function useTouchDirectionRouter(wrapperRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    let startX = 0, startY = 0;
    let dirLocked: 'h' | 'v' | null = null;
    let startScrollY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      startScrollY = window.scrollY;
      dirLocked = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);

      if (dirLocked === null && (dx > 4 || dy > 4)) {
        dirLocked = dy > dx ? 'v' : 'h';
      }

      if (dirLocked === 'v') {
        // Vertical — scroll page, suppress canvas rotation
        e.stopPropagation();
        const delta = t.clientY - startY;
        window.scrollTo({ top: startScrollY - delta, behavior: 'instant' as ScrollBehavior });
      }
      // Horizontal — let it fall through to OrbitControls naturally
    };

    // Must use { passive: false } so we can call stopPropagation
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [wrapperRef]);
}

interface SP{pgName:string;totalFloors:number;rooms:Room[];activeFloor:number|null;filterType?:number|null;onFloorClick:(f:number)=>void;onRoomClick:(r:Room)=>void;setHovered:(v:boolean)=>void;}
function Scene({pgName,totalFloors,rooms,activeFloor,filterType,onFloorClick,onRoomClick,setHovered}:SP) {
  const floors=Array.from({length:totalFloors},(_,i)=>i+1);
  const cY=((totalFloors+1)*FH)/2;  // center includes G floor
  const controlsRef = useRef<any>(null);
  return (
    <>
      <ambientLight intensity={0.72} color="#fff8f0"/>
      <directionalLight position={[6,12,10]} intensity={2.2} color="#fffae0"/>
      <directionalLight position={[-8,6,2]} intensity={0.5} color="#c8deff"/>
      <directionalLight position={[0,-3,4]} intensity={0.25} color="#ffeed0"/>
      <pointLight position={[0,0.7,FD/2+1.6]} intensity={1.4} color="#ffa030" distance={5.5} decay={2}/>
      <pointLight position={[0,(totalFloors+1)*FH+1.2,0]} intensity={0.3} color="#fff0cc" distance={8} decay={2}/>
      <EntranceMesh totalFloors={totalFloors}/>
      <Tree x={-FW/2-0.9} z={FD/2-0.3} s={1.1}/>
      <Tree x={FW/2+0.85} z={FD/2-0.2} s={0.95}/>
      <Tree x={-FW/2-1.5} z={-0.4} s={0.8}/>
      <Tree x={FW/2+1.4} z={-0.5} s={0.85}/>
      {/* Entrance lamps — at building corners, arms bending toward door */}
      <EntranceLamp x={-FW/2+0.08} z={FD/2+0.05} side="left"/>
      <EntranceLamp x={FW/2-0.08} z={FD/2+0.05} side="right"/>
      {/* Car parked left of entrance door, Bike parked right */}
      <Car x={-FW/2+0.3} z={FD/2+1.35} rotY={Math.PI/2}/>
      <Bike x={FW/2-0.55} z={FD/2+1.05} rotY={Math.PI*0.04}/>
      {floors.map(floor=>(
        <FloorMesh key={floor} floor={floor} rooms={rooms} isActive={activeFloor===floor}
          filterType={filterType} onFloorClick={()=>onFloorClick(floor)} onRoomClick={onRoomClick} setHovered={setHovered}/>
      ))}
      <RoofMesh totalFloors={totalFloors} pgName={pgName}/>
      <CameraRig targetFloor={activeFloor} totalFloors={totalFloors}/>
      <OrbitControls
        ref={controlsRef}
        target={[0,cY,0]}
        enablePan={false}
        enableZoom={false}
        makeDefault
        /* Horizontal rotation allowed — 360° spin */
        minAzimuthAngle={-Infinity}
        maxAzimuthAngle={Infinity}
        /* Vertical fully locked — no tilt */
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
      />
    </>
  );
}

export default function Building3DViewR3F({pgName,totalFloors,rooms,onRoomClick,filterType}:Props) {
  const [activeFloor,setActiveFloor]=useState<number|null>(null);
  const [hovered,setHovered]=useState(false);
  const activeFloorRooms=activeFloor!==null?rooms.filter(r=>r.floor===activeFloor):[];
  const canvasH = Math.min(Math.max(480, totalFloors * 110 + 260), 820);
  const camZ = Math.max(18, totalFloors * 2.4 + 6);
  const cYPos = ((totalFloors + 1) * FH) / 2;
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  useTouchDirectionRouter(canvasWrapperRef);

  function handleFloorClick(floor:number){playWhoosh();setActiveFloor(prev=>prev===floor?null:floor);}

  return (
    <div style={{
      width:"100%",position:"relative",userSelect:"none",
      background:"linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #081020 100%)",
      borderRadius:"18px",
      margin:"8px 0",
      boxShadow:"0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      border:"1px solid rgba(255,255,255,0.07)",
      overflow:"hidden",
      display:"flex",
      alignItems:"center",
      justifyContent:"center",
    }}>
      <div ref={canvasWrapperRef}
        style={{width:"100%",height:canvasH+"px",cursor:hovered?"pointer":"grab",
          touchAction:"pan-y"  /* browser handles vertical scroll natively */
        }}>
        <Canvas frameloop="demand" dpr={[1,1.5]} camera={{position:[0, cYPos, camZ], fov:44}}
          gl={{antialias:false,powerPreference:"low-power",alpha:true}} style={{background:"transparent"}}
          onPointerMissed={()=>setHovered(false)}>
          <Scene pgName={pgName} totalFloors={totalFloors} rooms={rooms} activeFloor={activeFloor}
            filterType={filterType} onFloorClick={handleFloorClick} onRoomClick={onRoomClick} setHovered={setHovered}/>
        </Canvas>
      </div>
      {activeFloor!==null&&(
        <>
          <div className={styles.panelBackdrop} onClick={()=>{playWhoosh(true);setActiveFloor(null);}}/>
          <div className={styles.floorPanel}>
            <div className={styles.panelHandle}/>
            <div className={styles.panelHeader}>
              <div><p className={styles.panelFloorLabel}>Floor {activeFloor}</p><h3 className={styles.panelTitle}>🚪 Select a Room</h3></div>
              <button className={styles.panelClose} onClick={()=>{playWhoosh(true);setActiveFloor(null);}}>✕</button>
            </div>
            {activeFloorRooms.length===0?<p className={styles.emptyMsg}>No rooms on this floor.</p>:(
              <div className={styles.roomGrid}>
                {activeFloorRooms.map(room=>{
                  const rc=roomColor(room),free=room.beds.filter(b=>!b.isOccupied).length;
                  return (
                    <button key={room.id} className={styles.roomCard} style={{borderColor:`${rc}44`}}
                      onClick={()=>{playWhoosh(true);setActiveFloor(null);onRoomClick(room);}}>
                      <div className={styles.rcHeader}>
                        <span className={styles.rcNum} style={{color:rc}}>{room.roomNumber}</span>
                        <span className={styles.rcShare} style={{background:`${rc}18`,color:rc,borderColor:`${rc}35`}}>{room.sharingType}-Share</span>
                      </div>
                      <div className={styles.rcBeds}>
                        {room.beds.map(bed=><div key={bed.id} className={styles.rcBed} style={{background:bedColor(bed),boxShadow:`0 0 5px ${bedColor(bed)}80`}} title={bed.isOccupied?(bed.tenant?.name||"Occupied"):"Free"}/>)}
                      </div>
                      <span className={styles.rcStatus} style={{color:rc}}>
                        {free===0?"🔴 Full":free===room.beds.length?`🟢 ${free} free`:`🟡 ${free} free`}
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
