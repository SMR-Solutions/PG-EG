"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLogo from "@/components/AppLogo";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`;
}
function fmt(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function toDataUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext("2d");
        if (!ctx) { resolve(url); return; }
        ctx.drawImage(img, 0, 0);
        const mime = url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
        resolve(c.toDataURL(mime, 0.95));
      } catch { resolve(url); }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

interface Transaction { id: string; amount: number; paymentMode: string; note?: string; createdAt: string; }
interface RentRecord { id: string; month: string; amount: number; paidAmount: number; status: string; paymentMode?: string | null; paidAt?: string | null; transactions: Transaction[]; }
interface HistoryEvent { id: string; eventType: string; fromRoom?: string | null; toRoom?: string | null; note?: string | null; createdAt: string; }
interface TenantProfile {
  id: string; name: string; phone: string;
  altPhone?: string | null; emergencyContact?: string | null; emergencyRelation?: string | null;
  photoUrl?: string | null; idPhotoUrl?: string | null;
  joiningDate: string; leavingDate?: string | null;
  rentAmount?: number; advanceAmount?: number; paymentMode?: string | null;
  depositDeduction?: number | null; refundMode?: string | null;
  profession?: string | null; professionDetail?: string | null;
  status: string;
}
interface Bed { id: string; bedNumber: number; }
interface Room { id: string; roomNumber: string; floor: number; sharingType: number; }
interface PGInfo {
  id?: string;
  name?: string;
  type?: string | null;
  address?: string | null;
  city?: string | null;
  sharings?: string | number[] | null;
  managerName?: string | null;
  managerPhone?: string | null;
  paymentPhone?: string | null;
  coverImageUrl?: string | null;
  pgImages?: string[] | string | null;
}
interface ProfileData {
  tenant: TenantProfile;
  bed: Bed | null;
  room: Room | null;
  rentRecords: RentRecord[];
  history: HistoryEvent[];
  pg?: PGInfo | null;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function TenantProfileInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantId = params.get("id");
  const { token, owner, activePgId, allPgs, isLoading: authLoading, isAuthenticated } = useAuth();

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [idFlipped, setIdFlipped] = useState(false);

  // Hidden refs for camera capture & gallery upload
  const selfieRef = useRef<HTMLInputElement>(null);     // gallery upload
  const selfieCamRef = useRef<HTMLInputElement>(null);  // camera capture
  const idCardRef = useRef<HTMLInputElement>(null);     // gallery upload
  const idCardCamRef = useRef<HTMLInputElement>(null);  // camera capture

  // Which picker popup is open: null | "selfie" | "id"
  const [photoPicker, setPhotoPicker] = useState<null | "selfie" | "id">(null);

  // Lightbox state
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [touchStart, setTouchStart] = useState<{x: number, y: number} | null>(null);
  const [touchEnd, setTouchEnd] = useState<{x: number, y: number} | null>(null);
  const [lastTap, setLastTap] = useState(0);
  const [pinchDist, setPinchDist] = useState(0);

  const handleLbTouchStart = (e: React.TouchEvent) => {
    if (e.targetTouches.length === 1) {
      setTouchEnd(null);
      setTouchStart({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
    } else if (e.targetTouches.length === 2) {
      const touch1 = e.targetTouches[0];
      const touch2 = e.targetTouches[1];
      setPinchDist(Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY));
    }
  };

  const handleLbTouchMove = (e: React.TouchEvent) => {
    if (e.targetTouches.length === 1) {
      setTouchEnd({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
    } else if (e.targetTouches.length === 2) {
      const touch1 = e.targetTouches[0];
      const touch2 = e.targetTouches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      if (pinchDist) {
        const delta = dist - pinchDist;
        setLightboxZoom(z => Math.min(5, Math.max(1, z + delta * 0.015)));
      }
      setPinchDist(dist);
    }
  };

  const handleLbTouchEnd = () => {
    setPinchDist(0);
    
    // Double tap
    const now = Date.now();
    if (now - lastTap < 300) {
      setLightboxZoom(z => (z === 1 ? 2.5 : 1));
      setLastTap(0);
    } else {
      setLastTap(now);
    }

    // Swipe
    if (!touchStart || !touchEnd) return;
    const xDistance = touchStart.x - touchEnd.x;
    const yDistance = Math.abs(touchStart.y - touchEnd.y);
    
    // Swipe left or right if horizontal movement is greater than vertical movement
    if (Math.abs(xDistance) > 50 && yDistance < 60) {
      const pUrl = data?.tenant.photoUrl;
      const iUrl = data?.tenant.idPhotoUrl;
      if (pUrl && iUrl) {
        setLightboxImg(prev => prev === pUrl ? iUrl : pUrl);
        setLightboxZoom(1);
      }
    }
    
    setTouchStart(null);
    setTouchEnd(null);
  };

  // Rent payment state
  const [rentPayMode, setRentPayMode] = useState<"cash" | "upi">("cash");
  const [rentPayAmount, setRentPayAmount] = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);
  const [payError, setPayError] = useState("");
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [upiCopied, setUpiCopied] = useState(false);

  // ── Edit / Complete Profile state ──────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editJoiningDate, setEditJoiningDate] = useState("");
  const [editAltPhone, setEditAltPhone] = useState("");
  const [editEmergency, setEditEmergency] = useState("");
  const [editEmergencyRel, setEditEmergencyRel] = useState("Father");
  const [editProfession, setEditProfession] = useState<"student"|"jobholder"|"other"|"">("");
  const [editProfDetail, setEditProfDetail] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState<string|null>(null);
  const [editIdUrl, setEditIdUrl] = useState<string|null>(null);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [uploadingId, setUploadingId] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  // ── Rent Receipt Modal state ───────────────────────────────────────────
  interface ReceiptData {
    amount: number;
    mode: string;
    month: string;
    note?: string | null;
    createdAt: string;
  }
  const [receiptModal, setReceiptModal] = useState<ReceiptData | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);

  // ── Share & Download PDF state ─────────────────────────────────────────
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const activePg = allPgs?.find(p => p.id === activePgId);

  // ── Build Single-Tenant Official Dossier & Printable HTML ─────────────
  const buildTenantDocumentHTML = useCallback(async () => {
    if (!data) return "";
    const { tenant, room, bed, pg } = data;
    const currentActivePg = allPgs?.find(p => p.id === activePgId);
    const pgName = pg?.name || currentActivePg?.name || "PG Accommodation";
    const rawPgType = pg?.type || currentActivePg?.type || "gents";
    const pgType = rawPgType === "ladies" ? "👩‍🦰 LADIES PG" : rawPgType === "coliving" ? "🤝 CO-LIVING PG" : "👨‍🦱 GENTS PG";
    const pgTypeBadgeText = rawPgType === "ladies" ? "LADIES PG" : rawPgType === "coliving" ? "CO-LIVING PG" : "GENTS PG";
    const pgAddress = pg?.address ? `${pg.address}${pg.city ? `, ${pg.city}` : ""}` : "Address on record";
    const pgPhone = pg?.managerPhone || pg?.paymentPhone || currentActivePg?.paymentPhone || owner?.phone || "—";

    let sharingsDisplay = "1, 2, 3 Sharing";
    if (pg?.sharings) {
      try {
        const raw = typeof pg.sharings === "string" ? JSON.parse(pg.sharings) : pg.sharings;
        if (Array.isArray(raw) && raw.length > 0) {
          sharingsDisplay = raw.map((s: number) => `${s}-Sharing`).join(", ");
        }
      } catch {
        sharingsDisplay = String(pg.sharings);
      }
    }

    const currentAny = currentActivePg as any;
    const rawPgPhoto = pg?.coverImageUrl || (Array.isArray(pg?.pgImages) ? pg?.pgImages[0] : null) || currentAny?.coverImageUrl || (Array.isArray(currentAny?.pgImages) ? currentAny.pgImages[0] : null) || "";
    const managerName = pg?.managerName || owner?.name || "PG Manager";

    // Convert images to base64 Data URLs so they print cleanly without network delays or CORS errors
    const [avatarDataUrl, idDataUrl, pgThumbDataUrl, pgegLogoDataUrl] = await Promise.all([
      tenant.photoUrl ? toDataUrl(tenant.photoUrl) : Promise.resolve(""),
      tenant.idPhotoUrl ? toDataUrl(tenant.idPhotoUrl) : Promise.resolve(""),
      rawPgPhoto ? toDataUrl(rawPgPhoto) : Promise.resolve(""),
      toDataUrl("/pg-eg-logo-wide.png").catch(() => ""),
    ]);

    const tenantIdShort = tenant.id ? tenant.id.slice(0, 8).toUpperCase() : "";
    const issueDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const issueTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    const cleanPhone = (tenant.phone || "").replace(/\D/g, "").slice(-10);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Tenant Stay Details – ${tenant.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  
  body {
    background: #f1f5f9;
    color: #0f172a;
    font-size: 11.5px;
    padding: 20px 14px;
    display: flex;
    justify-content: center;
    -webkit-font-smoothing: antialiased;
  }

  .doc-wrapper {
    background: #ffffff;
    width: 100%;
    max-width: 960px;
    border: 1.5px solid #cbd5e1;
    border-radius: 14px;
    padding: 18px 20px;
    box-sizing: border-box;
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
  }

  /* ── Header Card ────────────────────────────── */
  .header-card {
    border: 1.5px solid #cbd5e1;
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 14px;
    background: #ffffff;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }
  .header-left {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    flex: 1;
  }
  .pg-thumb {
    width: 120px;
    height: 90px;
    border-radius: 8px;
    object-fit: cover;
    border: 1.5px solid #e2e8f0;
    flex-shrink: 0;
  }
  .pg-info {
    flex: 1;
  }
  .pg-title {
    font-size: 21px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.02em;
    margin-bottom: 3px;
  }
  .pg-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0f172a;
    color: #ffffff;
    font-size: 9.5px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 4px;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
  }
  .pg-meta-line {
    font-size: 11px;
    color: #334155;
    margin-bottom: 3px;
    line-height: 1.4;
  }
  .pg-meta-line strong {
    color: #0f172a;
  }

  .doc-meta {
    text-align: right;
    flex-shrink: 0;
  }
  .doc-title {
    font-size: 13.5px;
    font-weight: 900;
    letter-spacing: 0.06em;
    color: #0f172a;
    text-transform: uppercase;
  }
  .doc-badge {
    display: inline-block;
    background: #10b981;
    color: #ffffff;
    font-size: 9.5px;
    font-weight: 800;
    padding: 2.5px 9px;
    border-radius: 12px;
    margin: 4px 0;
    letter-spacing: 0.03em;
  }
  .doc-id {
    font-size: 10px;
    font-family: monospace;
    font-weight: 700;
    color: #64748b;
  }
  .doc-date {
    font-size: 9.5px;
    color: #64748b;
    margin-top: 2px;
  }

  /* ── Tenant Identity Card ───────────────────── */
  .identity-card {
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 20px;
    background: #ffffff;
  }
  .photos-cluster {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    flex-shrink: 0;
  }
  .photo-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }
  .avatar-img {
    width: 78px;
    height: 78px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #e2e8f0;
  }
  .id-img {
    width: 105px;
    height: 78px;
    border-radius: 8px;
    object-fit: cover;
    border: 1.5px solid #e2e8f0;
  }
  .photo-placeholder {
    width: 78px;
    height: 78px;
    border-radius: 50%;
    background: #f1f5f9;
    border: 2px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: #64748b;
    text-align: center;
    font-weight: 700;
  }
  .id-placeholder {
    width: 105px;
    height: 78px;
    border-radius: 8px;
    background: #f1f5f9;
    border: 1.5px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: #64748b;
    text-align: center;
    font-weight: 700;
  }
  .photo-caption {
    font-size: 9px;
    font-weight: 800;
    color: #475569;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .identity-details {
    flex: 1;
  }
  .tenant-name-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .tenant-name {
    font-size: 22px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.01em;
  }
  .status-pill-active {
    background: #dcfce7;
    color: #15803d;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .status-pill-checkout {
    background: #fee2e2;
    color: #b91c1c;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 24px;
  }
  .field {
    display: flex;
    flex-direction: column;
  }
  .field-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 9.5px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .field-val {
    font-size: 12px;
    font-weight: 800;
    color: #0f172a;
  }

  /* ── Main Content Grid (Stay + Financials) ──── */
  .main-content-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
    align-items: stretch;
  }
  .section-card {
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
    display: flex;
    flex-direction: column;
  }
  .section-banner {
    background: #0f172a;
    color: #ffffff;
    padding: 8px 14px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-transform: uppercase;
  }
  .section-body {
    padding: 12px 14px;
    flex: 1;
  }

  /* Stay Details Grid */
  .stay-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px 10px;
  }
  .stay-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .stay-icon {
    font-size: 17px;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .check-icon {
    color: #10b981;
  }
  .stay-label {
    font-size: 9px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    margin-bottom: 2px;
    display: block;
  }
  .stay-val {
    font-size: 11.5px;
    font-weight: 800;
    color: #0f172a;
    display: block;
  }

  /* Financials Card */
  .right-column-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .fin-card {
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
  }
  .fin-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    gap: 12px;
  }
  .fin-stat {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }
  .fin-icon-square {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 900;
    flex-shrink: 0;
  }
  .rupee-sq {
    background: #e0f2fe;
    color: #0284c7;
  }
  .shield-sq {
    background: #e0f2fe;
    color: #0284c7;
  }
  .fin-label {
    font-size: 9px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    margin-bottom: 2px;
    display: block;
  }
  .fin-val {
    font-size: 14px;
    font-weight: 900;
    color: #0f172a;
    display: block;
  }
  .fin-divider {
    width: 1px;
    height: 40px;
    background: #e2e8f0;
    flex-shrink: 0;
  }

  /* Declaration box */
  .undertaking-box {
    border: 1.5px solid #bfdbfe;
    border-radius: 8px;
    background: #f8fafc;
    padding: 10px 12px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .undertaking-icon {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: #e0f2fe;
    color: #0284c7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .undertaking-text {
    font-size: 10px;
    color: #334155;
    line-height: 1.45;
  }
  .undertaking-text strong {
    color: #0f172a;
  }

  /* ── Signatures Section ──────────────────────── */
  .signatures-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
  }
  .sig-card {
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    background: #ffffff;
    padding: 12px 14px;
    box-sizing: border-box;
  }
  .sig-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 800;
    color: #0f172a;
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  .sig-meta {
    font-size: 9.5px;
    color: #64748b;
    margin-bottom: 8px;
  }
  .sig-dotted-box {
    border: 1.5px dashed #cbd5e1;
    border-radius: 6px;
    height: 44px;
    background: #f8fafc;
  }
  .digital-sig-box {
    border: 1.5px dashed #93c5fd;
    border-radius: 6px;
    height: 44px;
    background: #f0f7ff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    box-sizing: border-box;
  }
  .digital-sig-name {
    font-family: 'Brush Script MT', 'Segoe Script', 'Dancing Script', 'Caveat', cursive, sans-serif;
    font-size: 21px;
    font-style: italic;
    font-weight: 700;
    color: #1e40af;
    line-height: 1.1;
    letter-spacing: 0.5px;
  }
  .digital-sig-seal {
    font-size: 8px;
    font-weight: 800;
    color: #0284c7;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 3px;
    margin-top: 2px;
  }
  .digital-sig-note {
    font-size: 8.5px;
    color: #64748b;
    font-style: italic;
    text-align: center;
    margin-top: 5px;
  }

  /* ── Footer ─────────────────────────────────── */
  .doc-footer {
    border-top: 1px dotted #cbd5e1;
    padding-top: 10px;
    margin-top: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    font-size: 9.5px;
    color: #64748b;
    font-weight: 600;
  }
  .footer-logo {
    height: 22px;
    width: auto;
    object-fit: contain;
    display: inline-block;
  }

  /* ── Page 2: Govt ID Proof Document ────────── */
  .page-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin: 32px 0 24px;
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .page-divider::before, .page-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    border-top: 1.5px dashed #cbd5e1;
  }

  .id-proof-card {
    border: 1.5px solid #cbd5e1;
    border-radius: 12px;
    overflow: hidden;
    background: #ffffff;
    margin-bottom: 14px;
    display: flex;
    flex-direction: column;
  }
  .id-proof-banner {
    background: #0f172a;
    color: #ffffff;
    padding: 10px 16px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-transform: uppercase;
  }
  .id-proof-display-area {
    padding: 24px 20px;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 520px;
    box-sizing: border-box;
  }
  .full-size-id-img {
    max-width: 100%;
    max-height: 580px;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    border: 1.5px solid #cbd5e1;
    background: #ffffff;
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
  }
  .no-id-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #64748b;
    text-align: center;
  }
  .id-proof-footer-meta {
    border-top: 1.5px solid #e2e8f0;
    padding: 12px 18px;
    background: #ffffff;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 10.5px;
    color: #334155;
  }
  .id-meta-item strong {
    color: #0f172a;
  }

  /* ── Responsive Adaptations for Small Screens (Mobile) ── */
  @media (max-width: 767px) {
    body { padding: 6px 4px; font-size: 10.5px; }
    .doc-wrapper { padding: 10px 8px; border-radius: 12px; }
    .header-card { padding: 10px 12px; gap: 8px; justify-content: space-between; }
    .pg-thumb { display: none; }
    .pg-title { font-size: 17px; }
    .pg-meta-line { font-size: 10px; margin-bottom: 2px; }
    .doc-meta { text-align: right; min-width: 135px; flex-shrink: 0; }
    .doc-title { font-size: 11.5px; }
    .doc-badge { font-size: 8px; padding: 2px 7px; }
    .doc-id, .doc-date { font-size: 9px; }

    .identity-card { padding: 10px 12px; gap: 10px; align-items: center; }
    .avatar-img, .photo-placeholder { width: 56px; height: 56px; }
    .photo-caption { font-size: 7.5px; }
    .tenant-name { font-size: 18px; }
    .status-pill-active, .status-pill-checkout { font-size: 9.5px; padding: 2px 8px; }
    .details-grid { gap: 6px 8px; }
    .field-label { font-size: 8px; }
    .field-val { font-size: 10px; }

    .main-content-grid { display: flex; flex-direction: column; gap: 10px; }
    .stay-grid { grid-template-columns: repeat(3, 1fr); gap: 8px 6px; }
    .stay-icon { font-size: 14px; }
    .stay-label { font-size: 7.5px; }
    .stay-val { font-size: 10px; }

    .fin-row { padding: 10px 12px; }
    .fin-icon-square { width: 30px; height: 30px; font-size: 15px; }
    .fin-label { font-size: 8px; }
    .fin-val { font-size: 11.5px; }

    .undertaking-box { padding: 8px 10px; gap: 8px; }
    .undertaking-icon { width: 22px; height: 22px; font-size: 12px; }
    .undertaking-text { font-size: 8.5px; }

    .signatures-grid { display: flex; flex-direction: column; gap: 10px; }
    .sig-card { padding: 10px 12px; }
    .sig-header { font-size: 10px; }
    .sig-meta { font-size: 8.5px; margin-bottom: 6px; }
    .sig-dotted-box { height: 36px; }
    .id-proof-display-area { min-height: 320px; padding: 14px 10px; }
    .full-size-id-img { max-height: 380px; }
    .id-proof-footer-meta { flex-direction: column; align-items: flex-start; gap: 6px; }
  }

  /* ── Print Styles (A4 2-Page Document) ──────── */
  @media print {
    body { background: #ffffff !important; padding: 0 !important; margin: 0 !important; }
    .doc-wrapper { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    .page-divider { display: none !important; }
    .page-1 {
      page-break-after: always !important;
      break-after: page !important;
      min-height: 98vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .page-2 {
      page-break-before: always !important;
      break-before: page !important;
      min-height: 98vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .main-content-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
    .signatures-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
    .full-size-id-img { max-height: 600px !important; }
    @page { size: A4 portrait; margin: 8mm 10mm; }
  }
</style>
</head>
<body>
<div class="doc-wrapper">

  <!-- ══════════════════════════════════════════════════════ -->
  <!-- PAGE 1: TENANT STAY DETAILS & VERIFICATION RECORD     -->
  <!-- ══════════════════════════════════════════════════════ -->
  <div class="doc-page page-1">

    <!-- Top PG Header -->
    <div class="header-card">
      <div class="header-left">
        ${pgThumbDataUrl ? `<img src="${pgThumbDataUrl}" alt="${pgName}" class="pg-thumb" />` : ""}
        <div class="pg-info">
          <div class="pg-title">${pgName}</div>
          <div class="pg-type-badge">🏠 ${pgTypeBadgeText}</div>
          <div class="pg-meta-line"><span style="color:#ef4444;font-size:11px;margin-right:4px;">📍</span><strong>Address:</strong> ${pgAddress}</div>
          <div class="pg-meta-line"><span style="color:#ef4444;font-size:11px;margin-right:4px;">📞</span><strong>Contact:</strong> ${pgPhone}</div>
          <div class="pg-meta-line"><span style="color:#0f172a;font-size:11px;margin-right:4px;">🛏️</span><strong>Sharings Available:</strong> ${sharingsDisplay}</div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-title">TENANT STAY DETAILS</div>
        <div class="doc-badge">DIGITAL VERIFICATION DOCUMENT · PAGE 1 OF 2</div>
        <div class="doc-id">ID: PG-T-${tenantIdShort}</div>
        <div class="doc-date">Generated: ${issueDate}, ${issueTime}</div>
      </div>
    </div>

    <!-- Tenant Identity Card (Tenant Photo ONLY - ID proof moved to Page 2) -->
    <div class="identity-card">
      <div class="photos-cluster">
        <div class="photo-box">
          ${avatarDataUrl
            ? `<img src="${avatarDataUrl}" alt="${tenant.name}" class="avatar-img" />`
            : `<div class="photo-placeholder">👤 Photo Not Uploaded</div>`
          }
          <span class="photo-caption">TENANT PHOTO</span>
        </div>
      </div>

      <div class="identity-details">
        <div class="tenant-name-row">
          <span class="tenant-name">${tenant.name}</span>
          ${tenant.status === "active"
            ? `<span class="status-pill-active">● Active Staying</span>`
            : `<span class="status-pill-checkout">● Checked Out (${fmt(tenant.leavingDate)})</span>`
          }
        </div>

        <div class="details-grid">
          <div class="field">
            <span class="field-label">PRIMARY MOBILE</span>
            <span class="field-val"><span style="font-size:11px;margin-right:4px;">📞</span>+91 ${cleanPhone || tenant.phone}</span>
          </div>
          <div class="field">
            <span class="field-label">ALTERNATE MOBILE</span>
            <span class="field-val"><span style="font-size:11px;margin-right:4px;">📞</span>${tenant.altPhone ? `+91 ${tenant.altPhone}` : "—"}</span>
          </div>
          <div class="field">
            <span class="field-label">EMERGENCY CONTACT</span>
            <span class="field-val"><span style="font-size:11px;margin-right:4px;">🛡️</span>${tenant.emergencyContact ? `+91 ${tenant.emergencyContact} (${tenant.emergencyRelation || "Relative"})` : "—"}</span>
          </div>
          <div class="field">
            <span class="field-label">PROFESSION / DETAILS</span>
            <span class="field-val"><span style="font-size:11px;margin-right:4px;">💼</span>${tenant.profession ? `${tenant.profession}${tenant.professionDetail ? ` (${tenant.professionDetail})` : ""}` : "—"}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="main-content-grid">
      <!-- Left Column: Stay & Accommodation Details -->
      <div class="section-card">
        <div class="section-banner">
          <span>🏠 STAY & ACCOMMODATION DETAILS</span>
          <span>${room?.sharingType ? `${room.sharingType}-SHARING ROOM` : "ALLOCATED ROOM"}</span>
        </div>
        <div class="section-body">
          <div class="stay-grid">
            <div class="stay-item">
              <span class="stay-icon">🏢</span>
              <div>
                <span class="stay-label">FLOOR</span>
                <span class="stay-val">Floor ${room?.floor ?? "—"}</span>
              </div>
            </div>
            <div class="stay-item">
              <span class="stay-icon">🚪</span>
              <div>
                <span class="stay-label">ROOM NUMBER</span>
                <span class="stay-val">Room ${room?.roomNumber || "—"}</span>
              </div>
            </div>
            <div class="stay-item">
              <span class="stay-icon">🛏️</span>
              <div>
                <span class="stay-label">BED ALLOCATION</span>
                <span class="stay-val">Bed ${bed?.bedNumber || "—"}</span>
              </div>
            </div>
            <div class="stay-item">
              <span class="stay-icon">👥</span>
              <div>
                <span class="stay-label">ROOM SHARING</span>
                <span class="stay-val">${room?.sharingType ? `${room.sharingType}-Sharing` : "—"}</span>
              </div>
            </div>
            <div class="stay-item">
              <span class="stay-icon">📅</span>
              <div>
                <span class="stay-label">JOINING DATE</span>
                <span class="stay-val">${fmt(tenant.joiningDate)}</span>
              </div>
            </div>
            <div class="stay-item">
              <span class="stay-icon check-icon">✔️</span>
              <div>
                <span class="stay-label">STAY STATUS / CHECKOUT</span>
                <span class="stay-val">${tenant.leavingDate ? `Checked out on ${fmt(tenant.leavingDate)}` : "Present & Staying"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Financials & Declaration -->
      <div class="right-column-wrap">
        <div class="fin-card">
          <div class="section-banner">
            <span>💰 FINANCIAL TERMS & DEPOSIT RECORD</span>
          </div>
          <div class="fin-row">
            <div class="fin-stat">
              <div class="fin-icon-square rupee-sq">₹</div>
              <div>
                <span class="fin-label">MONTHLY RENT</span>
                <span class="fin-val">₹${(tenant.rentAmount || 0).toLocaleString("en-IN")} / month</span>
              </div>
            </div>
            <div class="fin-divider"></div>
            <div class="fin-stat">
              <div class="fin-icon-square shield-sq">🛡️</div>
              <div>
                <span class="fin-label">SECURITY DEPOSIT (ADVANCE)</span>
                <span class="fin-val">₹${(tenant.advanceAmount || 0).toLocaleString("en-IN")} via ${(tenant.paymentMode || "cash").toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Undertaking / Declaration -->
        <div class="undertaking-box">
          <div class="undertaking-icon">📄</div>
          <div class="undertaking-text">
            <strong>Declaration & Terms of Stay:</strong> The tenant agrees to follow PG house rules, maintain a peaceful stay, and pay monthly rent on or before the due date. The security deposit is refundable as per terms upon checkout.
          </div>
        </div>
      </div>
    </div>

    <!-- Official Signatures -->
    <div class="signatures-grid">
      <div class="sig-card">
        <div class="sig-header">
          <span>✒️</span>
          <span>TENANT SIGNATURE</span>
        </div>
        <div class="sig-meta">${tenant.name} &nbsp;•&nbsp; Date: _________________</div>
        <div class="sig-dotted-box"></div>
      </div>
      <div class="sig-card">
        <div class="sig-header">
          <span>🏛️</span>
          <span>AUTHORIZED PG SIGNATURE / STAMP</span>
        </div>
        <div class="sig-meta">For ${pgName} &nbsp;•&nbsp; Date: <strong>${issueDate}</strong></div>
        <div class="digital-sig-box">
          <div class="digital-sig-name">${managerName}</div>
          <div class="digital-sig-seal">
            <span style="color:#0284c7;font-weight:900;">✔</span> DIGITALLY VERIFIED &amp; AUTHORIZED · ${issueDate}
          </div>
        </div>
        <div class="digital-sig-note">( This is a digital signature of the PG Manager )</div>
      </div>
    </div>

    <!-- Page 1 Footer Watermark with PG-EG logo -->
    <div class="doc-footer">
      ${pgegLogoDataUrl
        ? `<img src="${pgegLogoDataUrl}" alt="PG-EG" class="footer-logo" />`
        : `<img src="/pg-eg-logo-wide.png" alt="PG-EG" class="footer-logo" />`
      }
      <span>Digital Verification Document &nbsp;•&nbsp; Generated via PG-EG &nbsp;•&nbsp; Find PGs & Manage PGs</span>
    </div>

  </div>

  <!-- Page Break / Screen Divider -->
  <div class="page-divider">
    <span>Attached Govt ID Document (Page 2)</span>
  </div>

  <!-- ══════════════════════════════════════════════════════ -->
  <!-- PAGE 2: OFFICIAL ATTACHED GOVT ID PROOF RECORD        -->
  <!-- ══════════════════════════════════════════════════════ -->
  <div class="doc-page page-2">

    <!-- Page 2 Header Card -->
    <div class="header-card">
      <div class="header-left">
        ${pgThumbDataUrl ? `<img src="${pgThumbDataUrl}" alt="${pgName}" class="pg-thumb" />` : ""}
        <div class="pg-info">
          <div class="pg-title">${pgName}</div>
          <div class="pg-type-badge">🏠 ${pgTypeBadgeText}</div>
          <div class="pg-meta-line"><span style="color:#ef4444;font-size:11px;margin-right:4px;">📍</span><strong>Address:</strong> ${pgAddress}</div>
          <div class="pg-meta-line"><span style="color:#ef4444;font-size:11px;margin-right:4px;">📞</span><strong>Contact:</strong> ${pgPhone}</div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-title">GOVT ID PROOF VERIFICATION</div>
        <div class="doc-badge">ATTACHED DIGITAL PROOF · PAGE 2 OF 2</div>
        <div class="doc-id">Tenant: <strong>${tenant.name}</strong> &nbsp;·&nbsp; ID: PG-T-${tenantIdShort}</div>
        <div class="doc-date">Generated: ${issueDate}, ${issueTime}</div>
      </div>
    </div>

    <!-- Page 2 Govt ID Proof Card (Half / Full Page Clearly Visible) -->
    <div class="id-proof-card">
      <div class="id-proof-banner">
        <span>🪪 OFFICIAL GOVT ID PROOF — ${tenant.name.toUpperCase()}</span>
        <span>VERIFIED TENANT RECORD</span>
      </div>

      <div class="id-proof-display-area">
        ${idDataUrl
          ? `<img src="${idDataUrl}" alt="Govt ID Proof – ${tenant.name}" class="full-size-id-img" />`
          : `<div class="no-id-placeholder">
               <span style="font-size:48px;">🪪</span>
               <p style="font-size:15px;font-weight:800;color:#0f172a;margin-top:12px;">Govt ID Proof Not Uploaded Yet</p>
               <p style="font-size:11.5px;color:#64748b;margin-top:4px;">Upload Aadhaar, Voter ID, Passport, or Driving License via Edit Profile.</p>
             </div>`
        }
      </div>

      <div class="id-proof-footer-meta">
        <div class="id-meta-item">
          <strong>Tenant Name:</strong> ${tenant.name}
        </div>
        <div class="id-meta-item">
          <strong>Primary Mobile:</strong> +91 ${cleanPhone || tenant.phone}
        </div>
        <div class="id-meta-item">
          <strong>Room &amp; Bed:</strong> Floor ${room?.floor ?? "—"}, Room ${room?.roomNumber || "—"}, Bed ${bed?.bedNumber || "—"}
        </div>
        <div class="id-meta-item">
          <strong>Verification Date:</strong> ${issueDate}
        </div>
      </div>
    </div>

    <!-- Page 2 Footer Watermark with PG-EG logo -->
    <div class="doc-footer">
      ${pgegLogoDataUrl
        ? `<img src="${pgegLogoDataUrl}" alt="PG-EG" class="footer-logo" />`
        : `<img src="/pg-eg-logo-wide.png" alt="PG-EG" class="footer-logo" />`
      }
      <span>Digital Verification Document &nbsp;•&nbsp; Generated via PG-EG &nbsp;•&nbsp; Find PGs & Manage PGs</span>
    </div>

  </div>

</div>

<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;
  }, [data, allPgs, activePgId, owner?.phone]);

  // ── Share Document Action: Directly to Tenant's Primary Mobile Number ──
  const handleShare = useCallback(async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const html = await buildTenantDocumentHTML();
      const safeName = data.tenant.name.replace(/[^a-zA-Z0-9]/g, "_") || "details";
      const cleanPhone = (data.tenant.phone || "").replace(/\D/g, "").slice(-10);
      const blob = new Blob([html], { type: "text/html" });
      const fileName = `Tenant-Stay-Details-${safeName}.html`;
      const file = new File([blob], fileName, { type: "text/html" });

      // On mobile / supported devices with Web Share file capability
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Tenant Stay Details – ${data.tenant.name}`,
            text: `Official Tenant Stay Details for ${data.tenant.name} (${activePg?.name || "PG Accommodation"})`,
          });
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
      }

      // Direct WhatsApp share to tenant's Primary Mobile Number (+91)
      if (cleanPhone) {
        const waMsg = `Hello ${data.tenant.name}, here are your official Tenant Stay Details for ${activePg?.name || "PG Accommodation"}.\n\n📄 Room: Room ${data.room?.roomNumber || "—"}, Bed ${data.bed?.bedNumber || "—"}\n💰 Monthly Rent: ₹${(data.tenant.rentAmount || 0).toLocaleString("en-IN")}\n🛡️ Security Deposit: ₹${(data.tenant.advanceAmount || 0).toLocaleString("en-IN")}`;
        window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(waMsg)}`, "_blank");
      }

      // Download the document file directly
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Share failed:", err);
      alert("Unable to share Tenant Stay Details document.");
    } finally {
      setGeneratingPdf(false);
    }
  }, [data, buildTenantDocumentHTML, activePg?.name]);

  // ── Download PDF Action ────────────────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const html = await buildTenantDocumentHTML();
      const safeName = data.tenant.name.replace(/[^a-zA-Z0-9]/g, "_") || "tenant";
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
      } else {
        // Fallback if popup was blocked by browser
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Tenant-Stay-Details-${safeName}.html`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Unable to generate PDF document. Please try again.");
    } finally {
      setGeneratingPdf(false);
    }
  }, [data, buildTenantDocumentHTML]);

  const load = useCallback(async () => {
    if (!tenantId) { setError("No tenant ID"); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/tenants/${tenantId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tenantId, token]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.replace("/sign-in"); return; }
    load();
  }, [load, authLoading, isAuthenticated, router]);

  // Auto-rotate between Photo & ID Proof every 2 seconds if both exist
  useEffect(() => {
    const hasPhoto = Boolean(data?.tenant?.photoUrl);
    const hasId = Boolean(data?.tenant?.idPhotoUrl);
    if (!hasPhoto || !hasId) return;
    if (lightboxImg) return; // Don't auto-rotate while lightbox is open

    const timer = setInterval(() => {
      setIdFlipped(prev => !prev);
    }, 2000);

    return () => clearInterval(timer);
  }, [data?.tenant?.photoUrl, data?.tenant?.idPhotoUrl, lightboxImg]);

  // Current month rent record
  const currentMonth = currentMonthStr();
  const currentRent = data?.rentRecords?.find((r) => r.month === currentMonth);
  const remaining = currentRent ? currentRent.amount - (currentRent.paidAmount || 0) : 0;

  function openEdit() {
    const t = data!.tenant;
    setEditPhone((t.phone || "").replace(/\D/g, "").slice(-10));
    setEditJoiningDate(t.joiningDate ? new Date(t.joiningDate).toISOString().split("T")[0] : "");
    setEditAltPhone(t.altPhone || "");
    setEditEmergency(t.emergencyContact || "");
    setEditEmergencyRel(t.emergencyRelation || "Father");
    setEditProfession((t.profession as "student"|"jobholder"|"other"|"") || "");
    setEditProfDetail(t.professionDetail || "");
    setEditPhotoUrl(t.photoUrl || null);
    setEditIdUrl(t.idPhotoUrl || null);
    setEditError(""); setEditSuccess("");
    setEditOpen(true);
  }

  async function uploadImage(file: File, field: "selfie" | "id"): Promise<string | null> {
    const setter = field === "selfie" ? setUploadingSelfie : setUploadingId;
    setter(true);
    setEditError("");
    try {
      const MAX_MB = 15;
      if (file.size > MAX_MB * 1024 * 1024) {
        throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please choose an image under ${MAX_MB}MB.`);
      }

      // Read file as base64 Data URL
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = () => reject(new Error("Could not read image file."));
        reader.readAsDataURL(file);
      });

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const folder = field === "selfie" ? "pg-eg/tenants/selfies" : "pg-eg/tenants/ids";
      const fileName = `tenant-${field}-${tenantId || Date.now()}-${Date.now()}.${ext}`;

      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          base64,
          fileName,
          folder,
        }),
      });

      const j = await res.json().catch(() => ({ error: `Upload error (${res.status})` }));
      if (!res.ok) throw new Error(j.error || "Upload failed");
      const url = j.url as string;

      // Auto-persist immediately to tenant record so it's not lost
      if (tenantId && url) {
        try {
          await fetch(`${API_URL}/api/tenants/${tenantId}/contact`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              [field === "selfie" ? "photoUrl" : "idPhotoUrl"]: url,
            }),
          });
          setEditSuccess(field === "selfie" ? "Selfie photo saved! ✅" : "ID card saved! ✅");
          await load();
          setTimeout(() => setEditSuccess(""), 3000);
        } catch (autoErr) {
          console.error("Auto-save photo error:", autoErr);
        }
      }

      return url;
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Upload failed");
      return null;
    } finally {
      setter(false);
    }
  }

  async function saveProfile() {
    if (!tenantId) return;
    setEditSaving(true); setEditError(""); setEditSuccess("");
    try {
      const cleanPhone = editPhone.replace(/\D/g, "").slice(-10);
      if (cleanPhone.length !== 10) {
        setEditError("Primary mobile number must be 10 digits");
        setEditSaving(false);
        return;
      }
      const body: Record<string, unknown> = {
        phone: cleanPhone,
        joiningDate: editJoiningDate || null,
        altPhone: editAltPhone.replace(/\D/g, "").slice(-10) || null,
        emergencyContact: editEmergency.replace(/\D/g, "").slice(-10) || null,
        emergencyRelation: editEmergency ? editEmergencyRel : null,
        profession: editProfession || null,
        professionDetail: editProfDetail.trim() || null,
        photoUrl: editPhotoUrl,
        idPhotoUrl: editIdUrl,
      };
      const res = await fetch(`${API_URL}/api/tenants/${tenantId}/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setEditSuccess("Profile updated! ✅");
      await load();
      setTimeout(() => { setEditOpen(false); setEditSuccess(""); }, 1200);
    } catch (e) { setEditError(e instanceof Error ? e.message : "Failed"); }
    setEditSaving(false);
  }

  async function handleMarkPaid() {
    if (!currentRent) return;
    setPayError("");
    // Blank = pay full remaining; otherwise parse exactly as typed
    const raw = rentPayAmount.trim();
    const payingNow = raw === "" ? remaining : Number(raw);

    if (!raw && !remaining) { setPayError("Enter a payment amount greater than ₹0"); return; }
    if (raw !== "" && (!Number.isFinite(payingNow) || payingNow <= 0)) {
      setPayError("Enter a payment amount greater than ₹0");
      return;
    }
    if (raw !== "" && !Number.isInteger(payingNow)) {
      setPayError("⚠️ Please enter a whole rupee amount (no paise/decimals)");
      return;
    }
    if (payingNow > remaining) {
      setPayError(`Amount cannot exceed the remaining balance of ₹${remaining.toLocaleString("en-IN")}`);
      return;
    }

    setMarkingPaid(true);
    try {
      const res = await fetch(`${API_URL}/api/rent/${currentRent.id}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ paymentMode: rentPayMode, amount: payingNow }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setRentPayAmount("");
      await load();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setMarkingPaid(false);
    }
  }

  if (loading) return (
    <main className={styles.main}>
      <div className={styles.centered}><span className={styles.spinner} /></div>
    </main>
  );

  if (error || !data) return (
    <main className={styles.main}>
      <div className={styles.centered}>
        <p className={styles.errorText}>{error || "Tenant not found"}</p>
        <button className={styles.backBtn} onClick={() => router.back()}>← Go Back</button>
      </div>
    </main>
  );

  const { tenant, bed, room } = data;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />

      {/* ── Photo source picker overlay — Camera vs Gallery ── */}
      {photoPicker && (
        <div className={styles.pickerBackdrop} onClick={() => setPhotoPicker(null)}>
          <div className={styles.pickerPopup} onClick={e => e.stopPropagation()}>
            <div className={styles.pickerTitle}>
              {photoPicker === "selfie"
                ? (editPhotoUrl ? "Change Selfie Photo" : "Add Selfie Photo")
                : (editIdUrl ? "Change ID Card Photo" : "Add ID Card Photo")}
            </div>
            <button
              type="button"
              className={styles.pickerBtn}
              onClick={() => {
                const target = photoPicker === "selfie" ? selfieCamRef.current : idCardCamRef.current;
                setPhotoPicker(null);
                target?.click();
              }}>
              <span>📷</span> Camera
            </button>
            <div className={styles.pickerDivider} />
            <button
              type="button"
              className={styles.pickerBtn}
              onClick={() => {
                const target = photoPicker === "selfie" ? selfieRef.current : idCardRef.current;
                setPhotoPicker(null);
                target?.click();
              }}>
              <span>🖼️</span> Upload from Gallery
            </button>
            <button
              type="button"
              className={styles.pickerCancel}
              onClick={() => setPhotoPicker(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Hidden inputs for Camera / Gallery ── */}
      <input
        ref={selfieCamRef}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          e.target.value = "";
          const url = await uploadImage(f, "selfie");
          if (url) setEditPhotoUrl(url);
        }}
      />
      <input
        ref={selfieRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          e.target.value = "";
          const url = await uploadImage(f, "selfie");
          if (url) setEditPhotoUrl(url);
        }}
      />
      <input
        ref={idCardCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          e.target.value = "";
          const url = await uploadImage(f, "id");
          if (url) setEditIdUrl(url);
        }}
      />
      <input
        ref={idCardRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          e.target.value = "";
          const url = await uploadImage(f, "id");
          if (url) setEditIdUrl(url);
        }}
      />

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/dashboard")} id="btn-back">← Dashboard</button>
        <div className={styles.headerNavActions}>
          <button
            type="button"
            className={`${styles.navActionBtn} ${styles.navShareBtn}`}
            onClick={handleShare}
            disabled={generatingPdf}
            title="Share Tenant Stay Details"
            id="btn-nav-share"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <span className={styles.navBtnLabel}>{generatingPdf ? "Exporting..." : "Share"}</span>
          </button>
          <button
            type="button"
            className={`${styles.navActionBtn} ${styles.navDownloadBtn}`}
            onClick={handleDownloadPDF}
            disabled={generatingPdf}
            title="Download Tenant Details PDF"
            id="btn-nav-download"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className={styles.navBtnLabel}>{generatingPdf ? "Exporting..." : "Download"}</span>
          </button>
        </div>
        <AppLogo size="xs" />
      </header>

      <div className={styles.content}>

        {/* Hero — photo (click to open lightbox) */}
        <div 
          className={styles.heroWrap} 
          onClick={() => {
            const url = idFlipped ? tenant.idPhotoUrl : tenant.photoUrl;
            if (url) {
              setLightboxImg(url);
              setLightboxZoom(1);
            }
          }}
          style={{ cursor: (idFlipped ? tenant.idPhotoUrl : tenant.photoUrl) ? "zoom-in" : "default" }}
        >
          {/* Photo side */}
          {tenant.photoUrl && (
            <img
              src={tenant.photoUrl}
              alt={tenant.name}
              className={`${styles.heroPhoto} ${!idFlipped ? styles.heroPhotoVisible : styles.heroPhotoHidden}`}
            />
          )}
          {/* ID card side */}
          {tenant.idPhotoUrl && (
            <img
              src={tenant.idPhotoUrl}
              alt="Govt ID Proof"
              className={`${styles.heroPhoto} ${idFlipped ? styles.heroPhotoVisible : styles.heroPhotoHidden}`}
              style={{ objectFit: "contain", background: "#0a0d14", padding: 14, boxSizing: "border-box" }}
            />
          )}
          {!tenant.photoUrl && !tenant.idPhotoUrl && (
            <div className={styles.heroPlaceholder}><span>👤</span></div>
          )}

          <div className={styles.heroGradient} />

          {/* Indicator pill showing currently displayed image type */}
          {tenant.photoUrl && tenant.idPhotoUrl && (
            <div className={styles.heroTypeIndicator}>
              {idFlipped ? "🪪 Govt ID Proof" : "📷 Tenant Photo"}
            </div>
          )}

          <div className={styles.heroName}>
            <h1 className={styles.tenantName}>{tenant.name}</h1>
            <span className={`${styles.statusBadge} ${tenant.status === "active" ? styles.statusActive : styles.statusOut}`}>
              {tenant.status === "active" ? "● ACTIVE" : "● CHECKED OUT"}
            </span>
          </div>
        </div>

        {/* Profession row — positioned ABOVE 📞 Contact */}
        <div className={styles.professionRowAbove}>
          <div className={styles.professionBadge}>
            <span className={styles.professionLabel}>Profession -</span>
            <span className={styles.professionValue}>
              {(() => {
                const pType = tenant.profession
                  ? (tenant.profession === "jobholder"
                      ? "Jobholder"
                      : tenant.profession.charAt(0).toUpperCase() + tenant.profession.slice(1))
                  : "";
                const pDetail = tenant.professionDetail ? tenant.professionDetail.trim() : "";
                if (pType && pDetail) return `${pType} - ${pDetail}`;
                if (pType) return pType;
                if (pDetail) return pDetail;
                return "—";
              })()}
            </span>
          </div>
        </div>

        {/* ── Contact ── */}
        <section className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>📞 Contact</h2>
            {/* Flip button — right side above Alternate number */}
            {tenant.idPhotoUrl && (
              <button
                className={styles.flipBtn}
                onClick={() => setIdFlipped(f => !f)}
                id="btn-flip-id"
              >
                🔄 {idFlipped ? "See Photo" : "See ID"}
              </button>
            )}
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Primary</span>
              <span className={styles.infoValue}>+91 {tenant.phone}</span>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Alternate</span>
              <span className={styles.infoValue} style={{ color: tenant.altPhone ? "var(--text-primary)" : "var(--text-muted)" }}>
                {tenant.altPhone ? `+91 ${tenant.altPhone}` : "—"}
              </span>
            </div>
            {/* Emergency contact — full width, always visible */}
            <div className={styles.infoCard} style={{
              gridColumn: "1 / -1",
              borderColor: tenant.emergencyContact ? "rgba(244,162,97,0.4)" : "var(--border)",
              background: tenant.emergencyContact ? "rgba(244,162,97,0.06)" : undefined,
            }}>
              <span className={styles.infoLabel}>
                🏥 Emergency Contact
                {tenant.emergencyRelation && (
                  <span className={styles.relationTag}>{tenant.emergencyRelation}</span>
                )}
              </span>
              <span className={styles.infoValue} style={{ color: tenant.emergencyContact ? "#f4a261" : "var(--text-muted)", fontSize: 16 }}>
                {tenant.emergencyContact ? `+91 ${tenant.emergencyContact}` : "Not provided"}
              </span>
            </div>
          </div>
        </section>

        {/* ── Complete / Edit Profile ── */}
        <section className={styles.section}>
          <button className={styles.editProfileToggle} onClick={() => editOpen ? setEditOpen(false) : openEdit()} id="btn-edit-profile">
            ✏️ {editOpen ? "Close Editor" : "Edit / Complete Profile"}
            <span className={styles.editChevron}>{editOpen ? "▲" : "▼"}</span>
          </button>

          {editOpen && (
            <div className={styles.editProfileBody}>
              {editError && <p className={styles.editErr}>⚠️ {editError}</p>}
              {editSuccess && <p className={styles.editOk}>{editSuccess}</p>}

              {/* Photos */}
              <p className={styles.editGroupLabel}>📷 Selfie Photo</p>
              <div className={styles.editPhotoRow}>
                {editPhotoUrl
                  ? <img src={editPhotoUrl} className={styles.editThumb} alt="selfie" />
                  : <div className={styles.editThumbEmpty}>👤</div>}
                <button
                  type="button"
                  className={styles.editUploadBtn}
                  onClick={() => setPhotoPicker("selfie")}
                  disabled={uploadingSelfie}
                  id="btn-edit-selfie">
                  {uploadingSelfie ? "Uploading…" : (editPhotoUrl ? "Change Photo" : "+ Add Selfie")}
                </button>
              </div>

              <p className={styles.editGroupLabel} style={{ marginTop: 14 }}>🪪 ID Card</p>
              <div className={styles.editPhotoRow}>
                {editIdUrl
                  ? <img src={editIdUrl} className={styles.editThumb} alt="id" style={{ objectFit: "contain" }} />
                  : <div className={styles.editThumbEmpty}>🪪</div>}
                <button
                  type="button"
                  className={styles.editUploadBtn}
                  onClick={() => setPhotoPicker("id")}
                  disabled={uploadingId}
                  id="btn-edit-id">
                  {uploadingId ? "Uploading…" : (editIdUrl ? "Change ID" : "+ Add ID Card")}
                </button>
              </div>

              {/* Primary Mobile */}
              <p className={styles.editGroupLabel} style={{ marginTop: 14 }}>📞 Primary Mobile Number</p>
              <div className={styles.editPhoneRow}>
                <span className={styles.phonePrefix}>+91</span>
                <input
                  type="tel"
                  className={styles.editInput}
                  placeholder="10-digit primary mobile number"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  id="ep-primary-phone"
                  maxLength={10}
                  inputMode="numeric"
                />
              </div>

              {/* Joining Date */}
              <p className={styles.editGroupLabel} style={{ marginTop: 14 }}>📅 Joining Date</p>
              <input
                type="date"
                className={styles.editInput}
                value={editJoiningDate}
                onChange={e => setEditJoiningDate(e.target.value)}
                id="ep-joining-date"
              />

              {/* Alt phone */}
              <p className={styles.editGroupLabel} style={{ marginTop: 14 }}>📱 Alternate Number</p>
              <input type="tel" className={styles.editInput} placeholder="Alternate mobile (optional)"
                value={editAltPhone} onChange={e => setEditAltPhone(e.target.value)} id="ep-alt-phone" />

              {/* Emergency contact */}
              <p className={styles.editGroupLabel} style={{ marginTop: 14 }}>🏥 Emergency Contact</p>
              <input type="tel" className={styles.editInput} placeholder="Emergency mobile number"
                value={editEmergency} onChange={e => setEditEmergency(e.target.value)} id="ep-emergency" />
              {editEmergency && (
                <div className={styles.editRelRow}>
                  {["Father","Mother","Brother","Sister","Friend","Other"].map(rel => (
                    <button key={rel} type="button"
                      className={`${styles.editRelTag} ${editEmergencyRel === rel ? styles.editRelTagActive : ""}`}
                      onClick={() => setEditEmergencyRel(rel)}>{rel}</button>
                  ))}
                </div>
              )}

              {/* Profession */}
              <p className={styles.editGroupLabel} style={{ marginTop: 14 }}>💼 Profession</p>
              <div className={styles.editProfRow}>
                {(["student","jobholder","other"] as const).map(p => (
                  <button key={p} type="button"
                    className={`${styles.editProfBtn} ${editProfession === p ? styles.editProfBtnActive : ""}`}
                    onClick={() => { setEditProfession(p); setEditProfDetail(""); }}>
                    {p === "student" ? "🎓 Student" : p === "jobholder" ? "💼 Job Holder" : "🔹 Other"}
                  </button>
                ))}
              </div>
              {editProfession === "student" && (
                <input type="text" className={styles.editInput} style={{ marginTop: 8 }}
                  placeholder="e.g. Engineering 3rd Year in JSS College…"
                  value={editProfDetail} onChange={e => setEditProfDetail(e.target.value)} id="ep-study" />
              )}
              {editProfession === "jobholder" && (
                <input type="text" className={styles.editInput} style={{ marginTop: 8 }}
                  placeholder="e.g. Software Engineer at Infosys, 140/A ABC Street…"
                  value={editProfDetail} onChange={e => setEditProfDetail(e.target.value)} id="ep-job" />
              )}
              {editProfession === "other" && (
                <input type="text" className={styles.editInput} style={{ marginTop: 8 }}
                  placeholder="What do you do? e.g. Freelancer, Business Owner…"
                  value={editProfDetail} onChange={e => setEditProfDetail(e.target.value)} id="ep-other" />
              )}

              <button className={styles.editSaveBtn} onClick={saveProfile} disabled={editSaving || uploadingSelfie || uploadingId} id="btn-save-profile">
                {editSaving ? <><span className={styles.spinnerSm} /> Saving…</> : "💾 Save Profile"}
              </button>
            </div>
          )}
        </section>

        {/* ── Stay Details ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🏠 Stay Details</h2>
          <div className={styles.infoGrid}>
            {room && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>{tenant.status === "active" ? "Room · Bed" : "Last Room · Bed"}</span>
                <span className={styles.infoValue}>{room.roomNumber} · Bed {bed?.bedNumber}</span>
              </div>
            )}
            {room && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>{tenant.status === "active" ? "Floor" : "Last Floor"}</span>
                <span className={styles.infoValue}>{room.floor}</span>
              </div>
            )}
            {room && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>Sharing</span>
                <span className={styles.infoValue}>{room.sharingType}-Bed</span>
              </div>
            )}
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Joined</span>
              <span className={styles.infoValue}>{fmt(tenant.joiningDate)}</span>
            </div>
            {tenant.leavingDate && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>Left</span>
                <span className={styles.infoValue}>{fmt(tenant.leavingDate)}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Money ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>💰 Money</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Monthly Rent</span>
              <span className={styles.infoValue}>₹{(tenant.rentAmount || 0).toLocaleString()}</span>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Deposit</span>
              <span className={styles.infoValue}>{tenant.advanceAmount ? `₹${tenant.advanceAmount.toLocaleString()}` : "—"}</span>
            </div>
            {tenant.paymentMode && (
              <div className={styles.infoCard}>
                <span className={styles.infoLabel}>Deposit Mode</span>
                <span className={styles.infoValue} style={{ textTransform: "uppercase" }}>{tenant.paymentMode}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Current Month Rent ── */}
        {currentRent && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>📅 {monthLabel(currentMonth)} Rent</h2>

            {currentRent.status === "paid" ? (
              <div className={styles.rentPaidCard}>
                <span>✅ FULLY PAID</span>
                <span>₹{(currentRent.paidAmount || 0).toLocaleString()}</span>
              </div>
            ) : (
              <>
                {/* Progress bar */}
                <div className={styles.rentProgressWrap}>
                  <div className={styles.rentProgressBar}>
                    <div
                      className={styles.rentProgressFill}
                      style={{ width: `${Math.min(100, ((currentRent.paidAmount || 0) / currentRent.amount) * 100)}%` }}
                    />
                  </div>
                  <div className={styles.rentProgressLabels}>
                    <span style={{ color: "#2dc653" }}>Paid: ₹{(currentRent.paidAmount || 0).toLocaleString()}</span>
                    <span style={{ color: "#e63946" }}>Remaining: ₹{remaining.toLocaleString()}</span>
                  </div>
                  {/* WhatsApp reminder button — only when rent is unpaid */}
                  {remaining > 0 && (
                    <button
                      className={styles.waNowBtn}
                      onClick={() => setShowReminderModal(true)}
                      id="btn-wa-reminder"
                    >
                      <svg viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="16" cy="16" r="16" fill="#25D366"/>
                        <path fill="#fff" d="M23.5 8.5A10.44 10.44 0 0 0 16 5.5C10.2 5.5 5.5 10.2 5.5 16a10.4 10.4 0 0 0 1.4 5.2L5.5 26.5l5.4-1.4a10.5 10.5 0 0 0 5.1 1.3c5.8 0 10.5-4.7 10.5-10.5a10.4 10.4 0 0 0-3-7.4zm-7.5 16.1a8.7 8.7 0 0 1-4.5-1.2l-.3-.2-3.2.8.9-3.1-.2-.3A8.7 8.7 0 0 1 7.3 16a8.7 8.7 0 0 1 8.7-8.7 8.7 8.7 0 0 1 8.7 8.7 8.7 8.7 0 0 1-8.7 8.6zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7 7 0 0 1-1.3-1.6c-.1-.3 0-.4.1-.6l.4-.5.3-.4v-.4l-.9-2.1c-.2-.5-.5-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8c.1.2 1.5 2.4 3.8 3.3a13 13 0 0 0 1.3.5 3.1 3.1 0 0 0 1.4.1c.4-.1 1.3-.5 1.5-1s.2-1 .1-1a.5.5 0 0 0-.4-.3z"/>
                      </svg>
                      Send Reminder
                    </button>
                  )}
                </div>

                {/* Partial payment form */}
                <p className={styles.fieldLabel}>Amount receiving now</p>
                <div className={styles.rentAmountRow}>
                  <span className={styles.rentAmountPrefix}>₹</span>
                  <input
                    type="number"
                    className={styles.rentAmountInput}
                    placeholder={`Full remaining: ${remaining.toLocaleString()}`}
                    value={rentPayAmount}
                    onChange={(e) => setRentPayAmount(e.target.value)}
                    inputMode="numeric"
                    id="input-rent-amount"
                  />
                </div>
                <p className={styles.fieldLabel} style={{ marginTop: 12 }}>Payment mode</p>
                <div className={styles.paymentRow}>
                  <button className={`${styles.payBtn} ${rentPayMode === "cash" ? styles.payBtnActive : ""}`}
                    onClick={() => setRentPayMode("cash")}>💵 CASH</button>
                  <button className={`${styles.payBtn} ${rentPayMode === "upi" ? styles.payBtnActive : ""}`}
                    onClick={() => setRentPayMode("upi")}>📱 UPI</button>
                </div>
                {payError && <p className={styles.payError}>⚠️ {payError}</p>}
                <button
                  className={styles.markPaidBtn}
                  onClick={handleMarkPaid}
                  disabled={markingPaid || (() => {
                    const raw = rentPayAmount.trim();
                    if (raw === "") return false; // blank = full remaining, always valid
                    const n = Number(raw);
                    return !Number.isFinite(n) || n <= 0 || !Number.isInteger(n) || n > remaining;
                  })()}
                  id="btn-mark-paid"
                >
                  {markingPaid
                    ? <><span className={styles.spinnerDark} /> Processing…</>
                    : (() => {
                        const raw = rentPayAmount.trim();
                        const display = raw === "" ? remaining : (Number.isFinite(Number(raw)) ? Number(raw) : 0);
                        return `💵 MARK AS PAID · ₹${Math.max(0, display).toLocaleString("en-IN")}`;
                      })()}
                </button>
              </>
            )}

            {/* Payment history for current month */}
            {currentRent.transactions.length > 0 && (
              <div className={styles.txnList}>
                <p className={styles.txnListTitle}>Payment history this month</p>
                {currentRent.transactions.map((txn) => (
                  <div key={txn.id} className={styles.txnRow}>
                    <div className={styles.txnLeft}>
                      <span className={styles.txnIcon}>{txn.paymentMode === "upi" ? "📱" : "💵"}</span>
                      <div>
                        <p className={styles.txnAmount}>₹{txn.amount.toLocaleString()}</p>
                        <p className={styles.txnMeta}>{txn.paymentMode?.toUpperCase()} · {fmt(txn.createdAt)} {fmtTime(txn.createdAt)}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {txn.note && <span className={styles.txnNote}>{txn.note}</span>}
                      <button
                        type="button"
                        className={styles.shareReceiptIconBtn}
                        onClick={() => setReceiptModal({ amount: txn.amount, mode: txn.paymentMode, month: currentRent.month, note: txn.note, createdAt: txn.createdAt })}
                        title="Share Payment Receipt"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3"/>
                          <circle cx="6" cy="12" r="3"/>
                          <circle cx="18" cy="19" r="3"/>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                        <span>Receipt</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Past Months ── */}
        {data.rentRecords.filter((r) => r.month !== currentMonth).length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>📜 Payment History</h2>
            {data.rentRecords.filter((r) => r.month !== currentMonth).map((rec) => (
              <div key={rec.id} className={styles.pastMonthCard}>
                <div className={styles.pastMonthHeader}>
                  <span className={styles.pastMonthLabel}>{monthLabel(rec.month)}</span>
                  <span className={`${styles.pastMonthStatus} ${rec.status === "paid" ? styles.pastPaid : styles.pastPending}`}>
                    {rec.status === "paid" ? "✅ PAID" : rec.status === "partial" ? "⚠️ PARTIAL" : "❌ PENDING"}
                  </span>
                  <span className={styles.pastMonthAmount}>₹{(rec.paidAmount || 0).toLocaleString()} / ₹{rec.amount.toLocaleString()}</span>
                </div>
                {rec.transactions.length > 0 && (
                  <div className={styles.pastTxns}>
                    {rec.transactions.map((txn) => (
                      <div key={txn.id} className={styles.pastTxnRow}>
                        <span>{txn.paymentMode === "upi" ? "📱" : "💵"} ₹{txn.amount.toLocaleString()}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className={styles.pastTxnDate}>{fmt(txn.createdAt)}</span>
                          <button
                            type="button"
                            className={styles.shareReceiptIconBtn}
                            onClick={() => setReceiptModal({ amount: txn.amount, mode: txn.paymentMode, month: rec.month, note: txn.note, createdAt: txn.createdAt })}
                            title="Share Payment Receipt"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="18" cy="5" r="3"/>
                              <circle cx="6" cy="12" r="3"/>
                              <circle cx="18" cy="19" r="3"/>
                              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                            </svg>
                            <span>Receipt</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── Full Lifecycle History ── */}
        {(() => {
          type TimelineItem =
            | { kind: "event"; id: string; eventType: string; fromRoom?: string | null; toRoom?: string | null; note?: string | null; createdAt: string }
            | { kind: "rent"; id: string; amount: number; mode: string; month: string; note?: string | null; createdAt: string };

          const items: TimelineItem[] = [
            ...(data.history ?? []).map((evt) => ({ kind: "event" as const, ...evt })),
            ...data.rentRecords.flatMap((rec) =>
              rec.transactions.map((txn) => ({
                kind: "rent" as const,
                id: `txn-${txn.id}`,
                amount: txn.amount,
                mode: txn.paymentMode,
                month: rec.month,
                note: txn.note ?? null,
                createdAt: txn.createdAt,
              }))
            ),
          ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          if (items.length === 0) return null;

          return (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>🕓 Full History</h2>
              <div style={{ position: "relative", paddingLeft: 28 }}>
                <div className={styles.historyLine} />

                {items.map((item, i) => {
                  const isLast = i === items.length - 1;

                  if (item.kind === "rent") {
                    return (
                      <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: isLast ? 0 : 20, position: "relative" }}>
                        <div style={{ position: "absolute", left: -22, top: 4, width: 12, height: 12, borderRadius: "50%", background: "#f4a261", border: "2px solid var(--bg-base)" }} />
                        <div className={`${styles.historyCard} ${styles.historyCardRent}`}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "#f4a261" }}>
                              {item.mode === "upi" ? "📱" : "💵"} Rent Paid · {monthLabel(item.month)}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className={styles.historyTimestamp}>{fmt(item.createdAt)} {fmtTime(item.createdAt)}</span>
                              <button
                                type="button"
                                className={styles.shareReceiptIconBtn}
                                onClick={() => setReceiptModal({ amount: item.amount, mode: item.mode, month: item.month, note: item.note, createdAt: item.createdAt })}
                                title="Share Payment Receipt"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="18" cy="5" r="3"/>
                                  <circle cx="6" cy="12" r="3"/>
                                  <circle cx="18" cy="19" r="3"/>
                                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                                </svg>
                                <span>Receipt</span>
                              </button>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span className={styles.historyAmount}>₹{item.amount.toLocaleString()}</span>
                            <span className={styles.historyMode}>{item.mode}</span>
                          </div>
                          {item.note && <p className={styles.historyNote}>{item.note}</p>}
                        </div>
                      </div>
                    );
                  }

                  const isCheckIn  = item.eventType === "check_in";
                  const isMove     = item.eventType === "move";
                  const isCheckOut = item.eventType === "check_out";

                  const dot   = isCheckIn ? "#2dc653" : isCheckOut ? "#e63946" : isMove ? "#4dabf7" : "#aaa";
                  const icon  = isCheckIn ? "🏠" : isCheckOut ? "🚪" : isMove ? "🔄" : "📋";
                  const label = isCheckIn ? "Checked In" : isCheckOut ? "Checked Out" : isMove ? "Room Move" : item.eventType;

                  let co: { deposit: string; deduction: string; refund: string; via: string } | null = null;
                  if (isCheckOut && item.note) {
                    const m = item.note.match(/Deposit: ₹([\d,]+), Deduction: ₹([\d,]+), Refund: ₹([\d,]+)\. Refund via (\w+)/i);
                    if (m) co = { deposit: m[1], deduction: m[2], refund: m[3], via: m[4] };
                  }

                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: isLast ? 0 : 20, position: "relative" }}>
                      <div style={{ position: "absolute", left: -22, top: 4, width: 12, height: 12, borderRadius: "50%", background: dot, border: "2px solid var(--bg-base)" }} />
                      <div className={styles.historyCard} style={{ borderColor: `${dot}40` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: dot }}>{icon} {label}</span>
                          <span className={styles.historyTimestamp}>{fmt(item.createdAt)} {fmtTime(item.createdAt)}</span>
                        </div>
                        {isMove && item.fromRoom && item.toRoom && (
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
                            <span style={{ color: "#f4a261" }}>{item.fromRoom}</span>
                            <span className={styles.historyMoveArrow}>→</span>
                            <span style={{ color: "#4dabf7" }}>{item.toRoom}</span>
                          </p>
                        )}
                        {isCheckOut && co && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: 6 }}>
                            {[["Deposit","var(--text-primary)",co.deposit],["Deduction","#e63946",co.deduction],["Refund","#2dc653",co.refund],["Via","var(--text-primary)",co.via.toUpperCase()]].map(([lbl,clr,val]) => (
                              <div key={lbl} className={styles.historyCoLabel}>{lbl}
                                <span className={styles.historyCoValue} style={{ color: clr }}>
                                  {lbl !== "Via" ? "₹" : ""}{val}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {isCheckOut && !co && item.note && <p className={styles.historyNote}>{item.note}</p>}
                        {(isCheckIn || (!isMove && !isCheckOut)) && item.note && <p className={styles.historyNote}>{item.note}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

      </div>

      {/* ─── Professional Reminder Modal ─── */}
      {showReminderModal && (() => {
        const { tenant, room, bed } = data!;
        const activePg = allPgs.find(p => p.id === activePgId);
        const pgName = activePg?.name ?? "PG";
        const pgType = activePg?.type ?? "";
        const upi = activePg?.paymentUpiId ?? null;
        const payPhone = activePg?.paymentPhone ?? null;
        const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const [yr, m] = currentMonth.split("-");
        const monthStr = m ? `${MONTHS[parseInt(m)-1]} ${yr}` : currentMonth;
        const rawPhone = (tenant.phone || "").replace(/\D/g, "");
        const waPhone  = rawPhone.startsWith("91") ? rawPhone : `91${rawPhone}`;

        const waMsg = [
          `★ *${pgName}${pgType ? ` — ${pgType}` : ""}*`,
          ``,
          `Dear *${tenant.name}*,`,
          ``,
          `This is a friendly reminder that your rent for *${monthStr}* is due.`,
          ``,
          `▸ Bed ${bed?.bedNumber ?? "—"} · Room: ${room?.roomNumber ?? "—"} · Floor ${room?.floor ?? "—"}`,
          `▸ Amount Due: *₹${remaining.toLocaleString("en-IN")}*`,
          ``,
          `━━━━━━━━━━━━━━━`,
          `▸ *Pay Instantly:*`,
          upi ? `UPI ID: ${upi}` : null,
          payPhone ? `Number: ${payPhone}` : null,
          (upi || payPhone) ? `${tenant.name}, you can just copy UPI ID / Mobile Number and pay.` : null,
          `━━━━━━━━━━━━━━━`,
          ``,
          `Kindly make the payment at your earliest convenience.`,
          `Thank you! :)`,
        ].filter(l => l !== null).join("\n");

        const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`;

        function copyText(text: string, setter: (v: boolean) => void) {
          navigator.clipboard.writeText(text).then(() => {
            setter(true); setTimeout(() => setter(false), 2000);
          });
        }

        return (
          <div className={styles.reminderOverlay} onClick={() => setShowReminderModal(false)}>
            <div className={styles.reminderModal} onClick={e => e.stopPropagation()}>
              <button className={styles.reminderClose} onClick={() => setShowReminderModal(false)}>✕</button>

              <div className={styles.invoiceHeader}>
                <div className={styles.invoicePgName}>{pgName}</div>
                {pgType && <div className={styles.invoicePgType}>{pgType}</div>}
                <div className={styles.invoiceDivider} />
              </div>

              <div className={styles.invoiceRow}>
                <span className={styles.invoiceLabel}>Tenant</span>
                <span className={styles.invoiceValue}>{tenant.name}</span>
              </div>
              <div className={styles.invoiceRow}>
                <span className={styles.invoiceLabel}>Room · Bed</span>
                <span className={styles.invoiceValue}>{room?.roomNumber ?? "—"} · Bed {bed?.bedNumber ?? "—"} · Floor {room?.floor ?? "—"}</span>
              </div>
              <div className={styles.invoiceRow}>
                <span className={styles.invoiceLabel}>Period</span>
                <span className={styles.invoiceValue}>{monthStr}</span>
              </div>

              <div className={styles.invoiceDivider} />

              <div className={styles.invoiceAmountRow}>
                <span className={styles.invoiceAmountLabel}>Amount Due</span>
                <span className={styles.invoiceAmount}>₹{remaining.toLocaleString("en-IN")}</span>
              </div>

              <div className={styles.invoiceDivider} />

              <p className={styles.invoicePayTitle}>Pay Instantly</p>

              {upi && (
                <div className={styles.upiPill}>
                  <span className={styles.upiPillId}>💸 {upi}</span>
                  <button className={styles.upiCopyBtn} onClick={() => copyText(upi!, setUpiCopied)}>
                    {upiCopied ? "✓ Copied!" : "📋 Copy UPI"}
                  </button>
                </div>
              )}

              {payPhone && (
                <div className={styles.upiPill} style={{ marginTop: 10 }}>
                  <span className={styles.upiPillId}>📱 {payPhone}</span>
                  <button className={styles.upiCopyBtn} onClick={() => copyText(payPhone!, setUpiCopied)}>
                    {upiCopied ? "✓ Copied!" : "📋 Copy"}
                  </button>
                </div>
              )}

              {!upi && !payPhone && (
                <p className={styles.noPaymentNote}>
                  ⚠️ No payment details set. Go to <strong>Profile → Payment</strong> to add UPI &amp; number.
                </p>
              )}

              <div className={styles.invoiceDivider} />

              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.waSendBtn}
                id="btn-send-whatsapp"
              >
                <svg viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="16" cy="16" r="16" fill="#25D366"/>
                  <path fill="#fff" d="M23.5 8.5A10.44 10.44 0 0 0 16 5.5C10.2 5.5 5.5 10.2 5.5 16a10.4 10.4 0 0 0 1.4 5.2L5.5 26.5l5.4-1.4a10.5 10.5 0 0 0 5.1 1.3c5.8 0 10.5-4.7 10.5-10.5a10.4 10.4 0 0 0-3-7.4zm-7.5 16.1a8.7 8.7 0 0 1-4.5-1.2l-.3-.2-3.2.8.9-3.1-.2-.3A8.7 8.7 0 0 1 7.3 16a8.7 8.7 0 0 1 8.7-8.7 8.7 8.7 0 0 1 8.7 8.7 8.7 8.7 0 0 1-8.7 8.6zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7 7 0 0 1-1.3-1.6c-.1-.3 0-.4.1-.6l.4-.5.3-.4v-.4l-.9-2.1c-.2-.5-.5-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8c.1.2 1.5 2.4 3.8 3.3a13 13 0 0 0 1.3.5 3.1 3.1 0 0 0 1.4.1c.4-.1 1.3-.5 1.5-1s.2-1 .1-1a.5.5 0 0 0-.4-.3z"/>
                </svg>
                Send Reminder via WhatsApp
              </a>
            </div>
          </div>
        );
      })()}

      {/* ─── Rent Payment Receipt Modal ─── */}
      {receiptModal && (() => {
        const { tenant, room, bed } = data!;
        const activePg = allPgs.find(p => p.id === activePgId);
        const pgName = activePg?.name ?? "PG";
        const pgType = activePg?.type ?? "";
        const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const [yr, m] = receiptModal.month.split("-");
        const monthStr = m ? `${MONTHS[parseInt(m)-1]} ${yr}` : receiptModal.month;
        const rawPhone = (tenant.phone || "").replace(/\D/g, "");
        const waPhone  = rawPhone.startsWith("91") ? rawPhone : `91${rawPhone}`;

        const waReceiptMsg = [
          `★ *${pgName}${pgType ? ` — ${pgType}` : ""}*`,
          `🧾 *RENT PAYMENT RECEIPT*`,
          ``,
          `Dear *${tenant.name}*,`,
          ``,
          `Thank you for your rent payment! Here is your official receipt:`,
          ``,
          `▸ *Period / Month:* ${monthStr}`,
          `▸ *Amount Paid:* *₹${receiptModal.amount.toLocaleString("en-IN")}*`,
          `▸ *Payment Mode:* ${receiptModal.mode.toUpperCase()}`,
          `▸ *Date & Time:* ${fmt(receiptModal.createdAt)} ${fmtTime(receiptModal.createdAt)}`,
          `▸ *Room & Bed:* Room ${room?.roomNumber ?? "—"} · Bed ${bed?.bedNumber ?? "—"} · Floor ${room?.floor ?? "—"}`,
          receiptModal.note ? `▸ *Note:* ${receiptModal.note}` : null,
          remaining === 0 ? `▸ *Status:* ✅ Fully Paid (₹0 Due)` : null,
          ``,
          `━━━━━━━━━━━━━━━`,
          `Thank you for staying with us at *${pgName}*! 🙏`,
          `Have a wonderful day ahead! ✨`,
        ].filter(l => l !== null).join("\n");

        const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waReceiptMsg)}`;

        function copyReceipt() {
          navigator.clipboard.writeText(waReceiptMsg).then(() => {
            setReceiptCopied(true);
            setTimeout(() => setReceiptCopied(false), 2000);
          });
        }

        return (
          <div className={styles.reminderOverlay} onClick={() => setReceiptModal(null)}>
            <div className={styles.reminderModal} onClick={e => e.stopPropagation()}>
              <button className={styles.reminderClose} onClick={() => setReceiptModal(null)}>✕</button>

              <div className={styles.invoiceHeader}>
                <div className={styles.receiptBadge}>✓ Official Rent Receipt</div>
                <div className={styles.invoicePgName}>{pgName}</div>
                {pgType && <div className={styles.invoicePgType}>{pgType}</div>}
                <div className={styles.invoiceDivider} />
              </div>

              <div className={styles.invoiceRow}>
                <span className={styles.invoiceLabel}>Tenant</span>
                <span className={styles.invoiceValue}>{tenant.name}</span>
              </div>
              <div className={styles.invoiceRow}>
                <span className={styles.invoiceLabel}>Room · Bed</span>
                <span className={styles.invoiceValue}>{room?.roomNumber ?? "—"} · Bed {bed?.bedNumber ?? "—"} · Floor {room?.floor ?? "—"}</span>
              </div>
              <div className={styles.invoiceRow}>
                <span className={styles.invoiceLabel}>Rent Period</span>
                <span className={styles.invoiceValue}>{monthStr}</span>
              </div>
              <div className={styles.invoiceRow}>
                <span className={styles.invoiceLabel}>Paid On</span>
                <span className={styles.invoiceValue}>{fmt(receiptModal.createdAt)} {fmtTime(receiptModal.createdAt)}</span>
              </div>
              <div className={styles.invoiceRow}>
                <span className={styles.invoiceLabel}>Payment Mode</span>
                <span className={styles.invoiceValue} style={{ textTransform: "uppercase" }}>{receiptModal.mode}</span>
              </div>
              {receiptModal.note && (
                <div className={styles.invoiceRow}>
                  <span className={styles.invoiceLabel}>Note</span>
                  <span className={styles.invoiceValue}>{receiptModal.note}</span>
                </div>
              )}

              <div className={styles.invoiceDivider} />

              <div className={styles.invoiceAmountRow}>
                <span className={styles.invoiceAmountLabel}>Amount Received</span>
                <span className={styles.receiptAmount}>₹{receiptModal.amount.toLocaleString("en-IN")}</span>
              </div>

              <div className={styles.invoiceDivider} />

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.waSendBtn}
                  id="btn-share-receipt-wa"
                >
                  <svg viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="16" fill="#25D366"/>
                    <path fill="#fff" d="M23.5 8.5A10.44 10.44 0 0 0 16 5.5C10.2 5.5 5.5 10.2 5.5 16a10.4 10.4 0 0 0 1.4 5.2L5.5 26.5l5.4-1.4a10.5 10.5 0 0 0 5.1 1.3c5.8 0 10.5-4.7 10.5-10.5a10.4 10.4 0 0 0-3-7.4zm-7.5 16.1a8.7 8.7 0 0 1-4.5-1.2l-.3-.2-3.2.8.9-3.1-.2-.3A8.7 8.7 0 0 1 7.3 16a8.7 8.7 0 0 1 8.7-8.7 8.7 8.7 0 0 1 8.7 8.7 8.7 8.7 0 0 1-8.7 8.6zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7 7 0 0 1-1.3-1.6c-.1-.3 0-.4.1-.6l.4-.5.3-.4v-.4l-.9-2.1c-.2-.5-.5-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8c.1.2 1.5 2.4 3.8 3.3a13 13 0 0 0 1.3.5 3.1 3.1 0 0 0 1.4.1c.4-.1 1.3-.5 1.5-1s.2-1 .1-1a.5.5 0 0 0-.4-.3z"/>
                  </svg>
                  Share Receipt via WhatsApp
                </a>

                <button
                  type="button"
                  className={styles.upiCopyBtn}
                  style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: "13px" }}
                  onClick={copyReceipt}
                >
                  {receiptCopied ? "✓ Receipt Text Copied!" : "📋 Copy Receipt Message"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ─── Lightbox Modal ─── */}
      {lightboxImg && (() => {
        const pUrl = data?.tenant?.photoUrl;
        const iUrl = data?.tenant?.idPhotoUrl;
        const hasBoth = !!(pUrl && iUrl);
        const toggleImg = () => {
          if (hasBoth) {
            setLightboxImg(prev => prev === pUrl ? iUrl : pUrl);
            setLightboxZoom(1);
          }
        };

        return (
          <div className={styles.lightboxOverlay} onClick={() => setLightboxImg(null)}>
            <button className={styles.lightboxClose} onClick={() => setLightboxImg(null)}>✕</button>
            
            {hasBoth && (
              <>
                <button className={`${styles.lightboxChevron} ${styles.lightboxChevronLeft}`} onClick={(e) => { e.stopPropagation(); toggleImg(); }}>❮</button>
                <button className={`${styles.lightboxChevron} ${styles.lightboxChevronRight}`} onClick={(e) => { e.stopPropagation(); toggleImg(); }}>❯</button>
              </>
            )}

            <button className={styles.lightboxDownload} onClick={async (e) => { 
              e.stopPropagation(); 
              try {
                const r = await fetch(lightboxImg);
                const b = await r.blob();
                const url = window.URL.createObjectURL(b);
                const a = document.createElement("a");
                a.href = url; 
                a.download = `pg-eg-tenant-${Date.now()}.jpg`;
                a.click(); 
                window.URL.revokeObjectURL(url);
              } catch(err) {
                window.open(lightboxImg, "_blank");
              }
            }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>

            <div className={styles.lightboxControls} onClick={(e) => e.stopPropagation()}>
              <button className={styles.lightboxBtn} onClick={() => setLightboxZoom(z => Math.max(1, z - 0.5))}>−</button>
              <span className={styles.lightboxZoomText}>{Math.round(lightboxZoom * 100)}%</span>
              <button className={styles.lightboxBtn} onClick={() => setLightboxZoom(z => Math.min(5, z + 0.5))}>+</button>
            </div>

            <div 
              className={styles.lightboxImageWrapper} 
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleLbTouchStart}
              onTouchMove={handleLbTouchMove}
              onTouchEnd={handleLbTouchEnd}
            >
              <img 
                src={lightboxImg} 
                alt="Zoomed" 
                className={styles.lightboxImage} 
                style={{ transform: `scale(${lightboxZoom})` }} 
              />
            </div>
          </div>
        );
      })()}

    </main>
  );
}

export default function TenantProfilePage() {
  return <Suspense fallback={null}><TenantProfileInner /></Suspense>;
}
