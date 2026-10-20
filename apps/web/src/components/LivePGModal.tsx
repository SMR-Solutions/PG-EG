"use client";

import { useEffect, useRef } from "react";
import styles from "./LivePGModal.module.css";

export interface LivePGModalProps {
  isOpen: boolean;
  onClose: () => void;
  pgName: string;
  videoUrl?: string | null;
  address?: string | null;
  duration?: number;
}

export default function LivePGModal({
  isOpen,
  onClose,
  pgName,
  videoUrl,
  address,
  duration,
}: LivePGModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Close on Escape key & manage body scroll
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

  if (!isOpen) return null;

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalCard} role="dialog" aria-modal="true">
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrap}>
            <span className={styles.livePulseDot} />
            <div className={styles.modalHeaderDetails}>
              <div className={styles.modalBadgeRow}>
                <span className={styles.liveBadge}>LIVE PG VIEW</span>
              </div>
              <h3 className={styles.modalPgName} title={pgName}>
                {pgName}
              </h3>
            </div>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Close Live PG Modal"
            id="btn-close-live-pg"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        {videoUrl ? (
          <>
            <div className={styles.videoWrap}>
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                autoPlay
                playsInline
                loop
                className={styles.videoPlayer}
              />
              <div className={styles.videoOverlayBadge}>
                <span className={styles.livePulseDot} /> LIVE LOCATION
              </div>
            </div>

            <div className={styles.videoMetaRow}>
              <span className={`${styles.metaPill} ${styles.metaPillLive}`}>
                ⏱️ {duration ? `${duration}s duration` : "5–10s location video"}
              </span>
              <span className={styles.metaPill}>
                💎 Original Uncompressed HD
              </span>
              {address && (
                <span className={`${styles.metaPill} ${styles.metaPillAddress}`} title={address}>
                  📍 {address.split(",")[0]}
                </span>
              )}
            </div>

            <div className={styles.infoBanner}>
              <p className={styles.infoTitle}>
                <span>🏢</span> Verified Live Exterior &amp; Street
              </p>
              <p className={styles.infoDesc}>
                Recorded directly by the PG owner showing the exterior facade and surrounding street.
                Gives you instant clarity on the real building and current neighborhood beyond static maps.
              </p>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📹</span>
            <h4 className={styles.emptyTitle}>Live Video Coming Soon</h4>
            <p className={styles.emptyDesc}>
              The owner of <strong>{pgName}</strong> has not yet uploaded their 5–10 second live location clip.
              Check back soon to view their building exterior and neighborhood!
            </p>
            <button
              type="button"
              className={styles.closePrimaryBtn}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
