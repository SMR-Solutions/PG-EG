"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import styles from "./ShareTenantModal.module.css";

export interface ShareTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: {
    id: string;
    name: string;
    phone: string;
    altPhone?: string | null;
    emergencyContact?: string | null;
    emergencyRelation?: string | null;
    photoUrl?: string | null;
    idPhotoUrl?: string | null;
    joiningDate: string;
    rentAmount?: number;
    advanceAmount?: number;
    paymentMode?: string | null;
    profession?: string | null;
    professionDetail?: string | null;
    status: string;
  };
  room?: {
    roomNumber: string;
    floor: number;
    sharingType: number;
  } | null;
  bed?: {
    bedNumber: number;
  } | null;
  pg?: {
    id?: string;
    name?: string;
    type?: string | null;
    address?: string | null;
    city?: string | null;
    managerPhone?: string | null;
    paymentPhone?: string | null;
  } | null;
  onDownloadPdf?: () => void;
  getPdfHtml?: () => Promise<string>;
}

export default function ShareTenantModal({
  isOpen,
  onClose,
  tenant,
  room,
  bed,
  pg,
  onDownloadPdf,
  getPdfHtml,
}: ShareTenantModalProps) {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const pgName = pg?.name || "PG Accommodation";
  const cleanPhone = (tenant.phone || "").replace(/\D/g, "").slice(-10);
  const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  // Handle escape key & manage body scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  // Helper to generate the document file & blob
  const getDocumentFile = useCallback(async (): Promise<{ file: File; blob: Blob }> => {
    const html = getPdfHtml ? await getPdfHtml() : "";
    const blob = new Blob([html], { type: "text/html" });
    const safeName = tenant.name.replace(/[^a-zA-Z0-9]/g, "_") || "details";
    const fileName = `Tenant-Stay-Details-${safeName}.html`;
    const file = new File([blob], fileName, { type: "text/html" });
    return { file, blob };
  }, [getPdfHtml, tenant.name]);

  // Direct WhatsApp share to the tenant's primary mobile number
  const handleWhatsApp = useCallback(async () => {
    setSharing(true);
    try {
      const { file, blob } = await getDocumentFile();

      // On mobile browsers (Android / iOS) with file sharing support,
      // trigger native OS share which lets owner pick WhatsApp and directly attach the document!
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Tenant Stay Details — ${tenant.name}`,
          text: `📄 Tenant Stay Details for ${tenant.name} (${pgName})`,
        });
        onClose();
        return;
      }

      // Web / Desktop flow:
      // 1. Download the document file into downloads folder so it's ready to drag & drop
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);

      // 2. Open WhatsApp chat directly with the tenant's primary number
      const waMsg = `📄 *Tenant Stay Details — ${pgName}*\nHello ${tenant.name}, here are your official stay details. Please find the attached document.`;
      const waUrl = waPhone
        ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(waMsg)}`;
      window.open(waUrl, "_blank");

      showToast("Document downloaded & WhatsApp chat opened!");
    } catch (e) {
      console.error("WhatsApp share error", e);
    } finally {
      setSharing(false);
    }
  }, [getDocumentFile, tenant.name, pgName, waPhone, onClose, showToast]);

  // Telegram share
  const handleTelegram = useCallback(async () => {
    setSharing(true);
    try {
      const { file, blob } = await getDocumentFile();

      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Tenant Stay Details — ${tenant.name}`,
        });
        onClose();
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);

      const pageUrl = typeof window !== "undefined" ? window.location.href : "https://pgeg.in";
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(`📄 Tenant Stay Details — ${tenant.name} (${pgName})`)}`,
        "_blank"
      );
      showToast("Document downloaded & Telegram opened!");
    } catch (e) {
      console.error("Telegram share error", e);
    } finally {
      setSharing(false);
    }
  }, [getDocumentFile, tenant.name, pgName, onClose, showToast]);

  // Instagram share
  const handleInstagram = useCallback(async () => {
    setSharing(true);
    try {
      const { file, blob } = await getDocumentFile();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);

      showToast("Document downloaded! Opening Instagram...");
      setTimeout(() => {
        window.open("https://www.instagram.com/", "_blank");
      }, 500);
    } catch {
      window.open("https://www.instagram.com/", "_blank");
    } finally {
      setSharing(false);
    }
  }, [getDocumentFile, showToast]);

  // More Apps / Native OS Share
  const handleNativeShare = useCallback(async () => {
    setSharing(true);
    try {
      const { file } = await getDocumentFile();
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Tenant Stay Details — ${tenant.name}`,
          text: `Official stay details document for ${tenant.name} at ${pgName}`,
        });
      } else if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `Tenant Stay Details — ${tenant.name}`,
          text: `Official stay details document for ${tenant.name} at ${pgName}`,
        });
      }
      onClose();
    } catch {
      // User cancelled
    } finally {
      setSharing(false);
    }
  }, [getDocumentFile, tenant.name, pgName, onClose]);

  // Direct Document Download
  const handleDownloadFile = useCallback(async () => {
    setSharing(true);
    try {
      const { file, blob } = await getDocumentFile();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Document downloaded successfully!");
    } catch {
      showToast("Failed to download document");
    } finally {
      setSharing(false);
    }
  }, [getDocumentFile, showToast]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="share-tenant-title">
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2 id="share-tenant-title" className={styles.modalTitle}>
            <span>📤</span> Share Tenant Stay Details
          </h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Tenant Target Banner */}
          <div className={styles.tenantBanner}>
            {tenant.photoUrl ? (
              <img src={tenant.photoUrl} alt={tenant.name} className={styles.tenantAvatar} />
            ) : (
              <div className={styles.tenantAvatarPlaceholder}>👤</div>
            )}
            <div className={styles.tenantInfo}>
              <div className={styles.tenantName}>{tenant.name}</div>
              <div className={styles.tenantPhoneBadge}>
                <span>📱 Primary:</span>
                <span>+91 {cleanPhone || tenant.phone}</span>
              </div>
              <div className={styles.tenantMeta}>
                Room {room?.roomNumber || "—"} · Bed {bed?.bedNumber || "—"} · {pgName}
              </div>
            </div>
          </div>

          {/* Document Notice */}
          <div className={styles.fileNotice}>
            <span>📄</span>
            <span>The official <strong>Tenant Stay Details</strong> document will be sent directly to the tenant.</span>
          </div>

          {/* Primary Action: Send to Tenant WhatsApp */}
          <button
            type="button"
            className={styles.primaryWhatsAppBtn}
            onClick={handleWhatsApp}
            disabled={sharing}
            id="btn-share-tenant-whatsapp-primary"
          >
            <div className={waBtnLeftClass}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              <div className={styles.waBtnTitles}>
                <span className={styles.waMainTitle}>Send Document to Tenant WhatsApp</span>
                <span className={styles.waSubTitle}>Primary Number: +91 {cleanPhone || tenant.phone}</span>
              </div>
            </div>
            <span className={styles.waBtnArrow}>➔</span>
          </button>

          {/* Secondary Apps: Telegram & Instagram */}
          <div className={styles.secondaryRow}>
            {/* Telegram */}
            <button
              type="button"
              className={styles.appItem}
              onClick={handleTelegram}
              title="Share Document on Telegram"
              id="share-tenant-telegram"
            >
              <div className={`${styles.appIconWrapSmall} ${styles.telegramBg}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/>
                </svg>
              </div>
              <span>Telegram</span>
            </button>

            {/* Instagram */}
            <button
              type="button"
              className={styles.appItem}
              onClick={handleInstagram}
              title="Share Document on Instagram"
              id="share-tenant-instagram"
            >
              <div className={`${styles.appIconWrapSmall} ${styles.instagramBg}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
              <span>Instagram</span>
            </button>
          </div>

          {/* System Share (OS Sheet) */}
          {typeof navigator !== "undefined" && !!navigator.share && (
            <button
              type="button"
              className={styles.moreOptionsBtn}
              onClick={handleNativeShare}
              disabled={sharing}
              id="share-tenant-more-apps"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
              </svg>
              <span>More Apps / System Share (Attach Document)</span>
            </button>
          )}

          {/* Direct File Download */}
          <button
            type="button"
            className={styles.downloadDirectBtn}
            onClick={handleDownloadFile}
            disabled={sharing}
            id="share-tenant-download-direct"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download Document File</span>
          </button>

          {/* Inline Feedback Toast */}
          {toastMsg && (
            <div className={styles.copiedToastInline}>
              {toastMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const waBtnLeftClass = styles.waBtnLeft;
