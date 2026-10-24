"use client";

import { useState, useEffect, useRef } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import styles from "./PGPhotoLightbox.module.css";

interface Props {
  open: boolean;
  close: () => void;
  images: any[];
  index?: number;
  onIndexChange?: (index: number) => void;
  pgName?: string;
  liveVideoUrl?: string | null;
  initialTab?: "photos" | "live";
}

export default function PGPhotoLightbox({
  open,
  close,
  images,
  index = 0,
  onIndexChange,
  pgName = "PG",
  liveVideoUrl,
  initialTab = "photos",
}: Props) {
  const [activeTab, setActiveTab] = useState<"photos" | "live">(initialTab);
  const [currentIndex, setCurrentIndex] = useState(index);
  const videoRef = useRef<HTMLVideoElement>(null);

  const zoomRef = useRef<any>(null);

  // Sync tab and index whenever lightbox opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab || "photos");
      setCurrentIndex(index);
    }
  }, [open, initialTab, index]);

  // Handle Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  if (!open) return null;

  const slides = (images || [])
    .map((img) => ({ src: typeof img === "string" ? img : img?.url || "" }))
    .filter((s) => Boolean(s.src));

  return (
    <Lightbox
      open={open}
      close={close}
      slides={slides}
      index={currentIndex}
      on={{
        view: ({ index: newIdx }) => {
          setCurrentIndex(newIdx);
          onIndexChange?.(newIdx);
        },
      }}
      plugins={[Zoom]}
      carousel={{ padding: 0 }}
      zoom={{
        ref: zoomRef,
        maxZoomPixelRatio: 3,
      }}
      toolbar={{
        buttons: [],
      }}
      render={{
        buttonZoom: () => null,
        buttonClose: () => null,
        controls: () => (
          <>
            {/* ── Top Centered Tabs: Photos & Live View ── */}
            <div className={styles.topBar}>
              <div className={styles.tabPill}>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${
                    activeTab === "photos" ? styles.tabBtnPhotosActive : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab("photos");
                  }}
                  id="btn-lightbox-photos"
                >
                  <span>📷</span> Photos
                </button>

                <button
                  type="button"
                  className={`${styles.tabBtn} ${
                    activeTab === "live" ? styles.tabBtnLiveActive : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab("live");
                  }}
                  id="btn-lightbox-live"
                >
                  <span className={styles.liveDot} />
                  Live View
                </button>
              </div>
            </div>

            {/* ── Top Right Close Button ── */}
            <button
              type="button"
              className={styles.closeBtn}
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              aria-label="Close Lightbox"
              id="btn-lightbox-close"
            >
              ✕
            </button>

            {/* ── Bottom Zoom Controls (Zoom In / Out moved to bottom) ── */}
            {activeTab === "photos" && (
              <div className={styles.bottomZoomControls}>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    zoomRef.current?.zoomIn?.();
                  }}
                  aria-label="Zoom in"
                  title="Zoom in"
                  id="btn-lightbox-zoom-in"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={styles.zoomBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    zoomRef.current?.zoomOut?.();
                  }}
                  aria-label="Zoom out"
                  title="Zoom out"
                  id="btn-lightbox-zoom-out"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── Live View Overlay (when Live View tab is active) ── */}
            {activeTab === "live" && (
              <div
                className={styles.liveOverlay}
                onClick={(e) => {
                  if (e.target === e.currentTarget) close();
                }}
              >
                {liveVideoUrl ? (
                  <div className={styles.videoCard}>
                    <div className={styles.videoWrap}>
                      <video
                        ref={videoRef}
                        src={liveVideoUrl}
                        controls
                        autoPlay
                        playsInline
                        loop
                        className={styles.videoPlayer}
                      />
                      <div className={styles.videoOverlayBadge}>
                        <span className={styles.liveDot} /> LIVE LOCATION
                      </div>
                    </div>

                    <div className={styles.liveInfoBanner}>
                      <p className={styles.liveInfoTitle}>
                        <span>🏢</span> Verified Live Exterior &amp; Street — {pgName}
                      </p>
                      <p className={styles.liveInfoDesc}>
                        Recorded directly by the PG owner showing the exterior facade, entrance, and surrounding street neighborhood.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <span className={styles.emptyIcon}>📹</span>
                    <h4 className={styles.emptyTitle}>Live Video Coming Soon</h4>
                    <p className={styles.emptyDesc}>
                      The owner of <strong>{pgName}</strong> has not yet uploaded their 5–10 second live location clip.
                      Check back soon or browse the photo gallery!
                    </p>
                    <button
                      type="button"
                      className={styles.backPhotosBtn}
                      onClick={() => setActiveTab("photos")}
                    >
                      ← View Photos Gallery
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ),
      }}
    />
  );
}
