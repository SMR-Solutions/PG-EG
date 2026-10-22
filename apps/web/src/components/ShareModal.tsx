"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./ShareModal.module.css";

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  pg: {
    id: string;
    name: string;
    type?: string;
    address?: string;
    baseRent?: number | null;
    pgImages?: any;
    coverImageUrl?: string | null;
    rooms?: any[];
  };
}

export default function ShareModal({ isOpen, onClose, pg }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const pgUrl = typeof window !== "undefined" ? `${window.location.origin}/pg/${pg.id}` : "";

  // Derive rent
  let rentAmount = pg.baseRent;
  if (!rentAmount && pg.rooms && Array.isArray(pg.rooms)) {
    const rents = pg.rooms
      .flatMap((r: any) => r.beds?.map((b: any) => b.tenant?.rent?.amount))
      .filter((a: any): a is number => typeof a === "number" && a > 0);
    if (rents.length) rentAmount = Math.min(...rents);
  }

  const shareText = [
    `🏢 ${pg.name}`,
    pg.type === "ladies" ? "👩‍🦰 Ladies PG" : pg.type === "gents" ? "👨‍🦱 Gents PG" : "🤝 Co-Living",
    rentAmount ? `💰 Rent from ₹${rentAmount.toLocaleString("en-IN")}` : null,
    pg.address ? `📍 ${pg.address}` : null,
  ].filter(Boolean).join("\n");

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
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pgUrl);
      setCopied(true);
      showToast("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast("Failed to copy link");
    }
  }, [pgUrl, showToast]);

  const handleWhatsApp = useCallback(() => {
    const fullText = `${shareText}\n\n${pgUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(fullText)}`, "_blank");
  }, [shareText, pgUrl]);

  const handleTelegram = useCallback(() => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(pgUrl)}&text=${encodeURIComponent(shareText)}`, "_blank");
  }, [shareText, pgUrl]);

  const handleInstagram = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${pgUrl}`);
      showToast("Link copied! Opening Instagram...");
      setTimeout(() => {
        window.open("https://www.instagram.com/", "_blank");
      }, 600);
    } catch {
      window.open("https://www.instagram.com/", "_blank");
    }
  }, [shareText, pgUrl, showToast]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      const rawImages = typeof pg.pgImages === "string"
        ? (() => { try { return JSON.parse(pg.pgImages); } catch { return []; } })()
        : pg.pgImages;
      const firstImg = rawImages?.[0]?.url || rawImages?.[0] || pg.coverImageUrl;

      let filesPayload: { files?: File[] } = {};
      if (firstImg && typeof firstImg === "string") {
        try {
          const imgRes = await fetch(firstImg);
          const blob = await imgRes.blob();
          const file = new File([blob], `${pg.name.replace(/[^a-zA-Z0-9]/g, "_") || "pg"}.jpg`, { type: blob.type || "image/jpeg" });
          if (navigator.canShare?.({ files: [file] })) filesPayload = { files: [file] };
        } catch { /* skip */ }
      }
      await navigator.share({ title: pg.name, text: shareText, url: pgUrl, ...filesPayload });
      onClose();
    } catch { /* user cancelled */ }
  }, [pg, shareText, pgUrl, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="share-title">
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2 id="share-title" className={styles.modalTitle}>Share PG</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Most popular sharing apps first: WhatsApp, Telegram, Instagram */}
          <div className={styles.appsRow}>
            {/* WhatsApp — Official Logo with Telephone Receiver */}
            <button
              type="button"
              className={styles.appItem}
              onClick={handleWhatsApp}
              title="Share on WhatsApp"
              id="share-whatsapp-btn"
            >
              <div className={`${styles.appIconWrap} ${styles.whatsappBg}`}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
              </div>
              <span className={styles.appLabel}>WhatsApp</span>
            </button>

            {/* Telegram */}
            <button
              type="button"
              className={styles.appItem}
              onClick={handleTelegram}
              title="Share on Telegram"
              id="share-telegram-btn"
            >
              <div className={`${styles.appIconWrap} ${styles.telegramBg}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/>
                </svg>
              </div>
              <span className={styles.appLabel}>Telegram</span>
            </button>

            {/* Instagram */}
            <button
              type="button"
              className={styles.appItem}
              onClick={handleInstagram}
              title="Copy link & open Instagram"
              id="share-instagram-btn"
            >
              <div className={`${styles.appIconWrap} ${styles.instagramBg}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
              <span className={styles.appLabel}>Instagram</span>
            </button>
          </div>

          {/* Copy link input row */}
          <div className={styles.copySection}>
            <span className={styles.sectionLabel}>Page Link</span>
            <div className={styles.copyInputRow}>
              <input
                type="text"
                readOnly
                value={pgUrl}
                className={styles.copyInput}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ""}`}
                onClick={handleCopyLink}
                id="share-copy-btn"
              >
                {copied ? "✓ Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Feedback banner */}
          {toastMsg && (
            <div className={styles.copiedToastInline}>
              {toastMsg}
            </div>
          )}

          {/* More options button (native share if supported) */}
          {typeof navigator !== "undefined" && !!navigator.share && (
            <button
              type="button"
              className={styles.moreOptionsBtn}
              onClick={handleNativeShare}
              id="share-more-options-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
              </svg>
              <span>More Apps / Other Options</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
