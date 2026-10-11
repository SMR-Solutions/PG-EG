"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import dynamic from "next/dynamic";
import styles from "../../find-pg/page.module.css";
import pgStyles from "./pg.module.css";

const PGPhotoLightbox = dynamic(() => import("@/components/PGPhotoLightbox"), { ssr: false });

interface PGData {
  id: string;
  name: string;
  type: string;
  address: string;
  locationLink: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sharings: number[];
  managerPhone: string | null;
  baseRent?: number | null;
  pgImages?: any[];
  description?: string | null;
}

interface Props {
  pg: PGData;
}

export default function PGDetailClient({ pg }: Props) {
  const router = useRouter();
  const { isAuthenticated, isLoading, owner, toggleSavePg } = useAuth();
  const { theme, setTheme } = useTheme();
  const { canInstall, installing, triggerInstall } = usePwaInstall();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowSignInPrompt(true);
    }
  }, [isLoading, isAuthenticated]);

  const openGallery = () => {
    window.history.pushState({ gallery: true }, "");
    setLightboxOpen(true);
  };
  const closeGallery = () => {
    if (window.history.state?.gallery) window.history.back();
    else setLightboxOpen(false);
  };
  useEffect(() => {
    const fn = () => setLightboxOpen(false);
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);

  const handleShare = useCallback(async () => {
    const pgUrl = `${window.location.origin}/pg/${pg.id}`;

    // Text has NO URL — url field is separate so WhatsApp shows it ONCE as a rich preview card
    const shareText = [
      `🏢 ${pg.name}`,
      pg.type === "ladies" ? "👩‍🦰 Ladies PG" : pg.type === "gents" ? "👨‍🦱 Gents PG" : "🤝 Co-Living",
      pg.baseRent ? `💰 Rent from ₹${pg.baseRent.toLocaleString("en-IN")}` : null,
      pg.address ? `📍 ${pg.address}` : null,
    ].filter(Boolean).join("\n");

    if (navigator.share) {
      // Attempt to attach first image as a File (shows image in share drawer on mobile)
      const firstImg = pg.pgImages?.[0]?.url || pg.pgImages?.[0];
      let filesPayload: { files?: File[] } = {};
      if (firstImg) {
        try {
          const imgRes = await fetch(firstImg);
          const blob = await imgRes.blob();
          const file = new File([blob], `${pg.name}.jpg`, { type: blob.type });
          if (navigator.canShare?.({ files: [file] })) filesPayload = { files: [file] };
        } catch { /* image fetch failed, skip */ }
      }
      // url is separate from text — WhatsApp appends it once as a rich link preview
      navigator.share({ title: pg.name, text: shareText, url: pgUrl, ...filesPayload }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${shareText}\n\n${pgUrl}`);
      alert("PG details copied to clipboard!");
    }
  }, [pg]);

  const isSaved = owner?.savedPgs?.includes(pg.id);
  const typeClass = pg.type === "ladies" ? styles.pgTypeLadies : pg.type === "gents" ? styles.pgTypeGents : styles.pgTypeColiving;
  const typeLabel = pg.type === "ladies" ? "👩‍🦰 Ladies" : pg.type === "gents" ? "👨‍🦱 Gents" : "🤝 Co-Living";

  const SaveShareButtons = ({ inline = false }: { inline?: boolean }) => (
    <div className={inline ? pgStyles.headerActions : pgStyles.imageActions}>
      {isAuthenticated && (
        <button
          className={pgStyles.iconBtn}
          title={isSaved ? "Remove from saved" : "Save PG"}
          onClick={() => { if (toggleSavePg) toggleSavePg(pg.id, !isSaved); }}
        >
          {isSaved ? "❤️" : "🤍"}
        </button>
      )}
      <button className={pgStyles.iconBtn} title="Share this PG" onClick={handleShare}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>
    </div>
  );

  return (
    <main className={styles.main} data-theme={theme}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      {/* ── Navbar: back ← | theme toggle ── */}
      <div className={pgStyles.navbar}>
        <button className={pgStyles.navBtn} onClick={() => router.push("/find-pg")} title="Find PGs">←</button>
        <button className={pgStyles.navBtn} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>

      {/* Sign-in Banner — left: info | right: Download + Sign In buttons */}
      {showSignInPrompt && (
        <div className={pgStyles.signinBanner}>
          <div className={pgStyles.signinInfo}>
            <div className={pgStyles.signinTitle}>🔑 Sign in to save & explore more PGs</div>
            <div className={pgStyles.signinSub}>Your friend shared this PG with you — find more PGs nearby!</div>
          </div>
          <div className={pgStyles.signinBtns}>
            {/* PWA Install — only shown if browser supports it and app not yet installed */}
            {canInstall && (
              <button
                className={pgStyles.downloadBtn}
                onClick={triggerInstall}
                disabled={installing}
              >
              {installing ? "Installing…" : "📲 Download App & Sign In"}
              </button>
            )}
            <button
              className={styles.primaryBtn}
              style={{ whiteSpace: "nowrap", padding: "9px 18px", fontSize: "13px" }}
              onClick={() => router.push(`/sign-in?from=/pg/${pg.id}&role=user`)}
            >Sign In</button>
          </div>
        </div>
      )}

      {/* PG Card */}
      <div className={pgStyles.cardWrap}>
        <div className={styles.pgCard}>

          {/* Card Header — desktop: shows address + inline save/share */}
          <div className={pgStyles.cardHeaderRow}>
            {pg.address && (
              <span className={styles.headerAddressDesk}>
                <span className={styles.navIcon}>↗</span>{" "}
                {pg.address.split(",")[0]}{" "}
                <span className={styles.caret}>›</span>
              </span>
            )}
            {/* Save/Share shown here on desktop */}
            <SaveShareButtons inline />
          </div>

          <div className={styles.cardLayout}>
            {/* Image */}
            <div className={styles.cardImageArea} onClick={openGallery} style={{ cursor: pg.pgImages?.length ? "pointer" : "default" }}>
              {pg.pgImages && pg.pgImages.length > 0 ? (
                <img
                  src={pg.pgImages[0]?.url || pg.pgImages[0]}
                  alt={pg.name}
                  className={styles.pgMainImg}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className={styles.pgMainImgPlaceholder}>No Image Available</div>
              )}

              {/* Save/Share shown on image for mobile */}
              <SaveShareButtons />

              {pg.pgImages && pg.pgImages.length > 0 && (
                <div className={styles.photosBadge}>🖼 {pg.pgImages.length} Photos</div>
              )}
            </div>

            {/* Content */}
            <div className={styles.cardContentArea}>
              <h1 className={styles.pgName} style={{ fontSize: "clamp(18px, 4vw, 24px)" }}>{pg.name}</h1>

              <div className={styles.pgTypeRow}>
                <span className={typeClass}>{typeLabel}</span>
                {pg.baseRent && (
                  <span className={styles.pgBaseRent}>
                    <span className={styles.rupeeIcon}>₹</span> Rent Starting from ₹{pg.baseRent.toLocaleString("en-IN")}
                  </span>
                )}
              </div>

              {pg.sharings && pg.sharings.length > 0 && (
                <div className={styles.pgSharings}>
                  {pg.sharings.sort((a, b) => a - b).map((s) => (
                    <span key={s} className={styles.sharingChip}>{s}-Sharing</span>
                  ))}
                </div>
              )}

              {pg.address && (
                <p className={styles.pgAddress}>📍 {pg.address}</p>
              )}

              {pg.description && (
                <p style={{ fontSize: "13px", opacity: 0.7, marginTop: "8px", lineHeight: 1.5 }}>
                  {pg.description}
                </p>
              )}

              {/* Buttons — same layout as FindPGs page */}
              <div className={styles.pgCardBtns}>
                {pg.pgImages && pg.pgImages.length > 0 && (
                  <button className={styles.actionBtn} onClick={openGallery} id="btn-view-photos">
                    <span className={styles.actionIcon}>🏢</span>
                    <div className={styles.actionText}>
                      <span className={styles.actionTitle}>View PG</span>
                      <span className={styles.actionSub}>Photos & details</span>
                    </div>
                  </button>
                )}

                {pg.managerPhone && (
                  <>
                    <div className={styles.btnDivider} />
                    <a href={`tel:${pg.managerPhone.replace(/\D/g, "")}`} className={styles.actionBtn} id="btn-enquire">
                      <span className={styles.actionIcon}>☎️</span>
                      <div className={styles.actionText}>
                        <span className={styles.actionTitle}>Enquire</span>
                        <span className={styles.actionSub}>Contact owner</span>
                      </div>
                    </a>
                  </>
                )}

                {((pg.latitude && pg.longitude) || pg.locationLink || pg.address) ? (
                  <>
                    <div className={styles.btnDivider} />
                    <a
                      href={
                        pg.latitude && pg.longitude
                          ? `https://www.google.com/maps/dir/?api=1&destination=${pg.latitude},${pg.longitude}&travelmode=driving`
                          : pg.locationLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pg.name} ${pg.address || ""}`)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.actionBtn}
                      id="btn-directions"
                    >
                      <span className={styles.actionIcon}>🗺️</span>
                      <div className={styles.actionText}>
                        <span className={styles.actionTitle}>Directions</span>
                        <span className={styles.actionSub}>Reach easily</span>
                      </div>
                    </a>
                  </>
                ) : null}
              </div>

              {!isAuthenticated && !isLoading && (
                <div style={{ marginTop: "16px" }}>
                  <button
                    className={styles.primaryBtn}
                    onClick={() => router.push(`/sign-in?from=/pg/${pg.id}&role=user`)}
                    style={{ width: "100%", padding: "12px" }}
                  >🔍 Find More PGs Near Me</button>
                  <p style={{ fontSize: "12px", textAlign: "center", opacity: 0.5, marginTop: "8px" }}>
                    Sign-in For Free
                  </p>
                </div>
              )}

              {isAuthenticated && (
                <div style={{ marginTop: "16px" }}>
                  <button
                    className={styles.primaryBtn}
                    onClick={() => router.push("/find-pg")}
                    style={{ width: "100%", padding: "12px" }}
                  >🔍 Explore More PGs Near Me</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && pg.pgImages && pg.pgImages.length > 0 && (
        <PGPhotoLightbox
          open={true}
          close={closeGallery}
          images={pg.pgImages}
        />
      )}
    </main>
  );
}
