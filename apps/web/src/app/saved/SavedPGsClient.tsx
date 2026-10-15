"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import dynamic from "next/dynamic";
import styles from "../find-pg/page.module.css";

const PGPhotoLightbox = dynamic(() => import("@/components/PGPhotoLightbox"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function SavedPGsClient() {
  const router = useRouter();
  const { isAuthenticated, isLoading, owner, toggleSavePg } = useAuth();
  const { theme, setTheme } = useTheme();

  const [pgs, setPgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewImagesFor, setViewImagesFor] = useState<any | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);

  // Only show PGs that are still in owner's savedPgs (removes instantly on unsave)
  const visiblePgs = pgs.filter(pg => owner?.savedPgs?.includes(pg.id));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/saved&role=user");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isLoading) return;
    if (!owner?.savedPgs || owner.savedPgs.length === 0) {
      setPgs([]);
      setLoading(false);
      return;
    }
    // Fetch any PGs not yet loaded locally
    const missingIds = owner.savedPgs.filter((id: string) => !pgs.find(p => p.id === id));
    if (missingIds.length === 0) { setLoading(false); return; }
    fetch(`${API_URL}/api/public/pgs/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pgIds: owner.savedPgs }),
    })
      .then((res) => res.json())
      .then((data) => { setPgs(data.pgs || []); setLoading(false); })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner?.savedPgs?.join(","), isLoading]);

  const openGallery = (pg: any) => {
    window.history.pushState({ gallery: true }, "");
    setViewImagesFor(pg);
  };
  const closeGallery = () => {
    if (window.history.state?.gallery) window.history.back();
    else setViewImagesFor(null);
  };
  useEffect(() => {
    const fn = () => setViewImagesFor(null);
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);

  const handleShare = useCallback(async (pg: any, e?: { stopPropagation: () => void }) => {
    if (e?.stopPropagation) e.stopPropagation();
    const pgUrl = `${window.location.origin}/pg/${pg.id}`;
    // Text has NO URL — WhatsApp auto-renders the URL as a rich link preview card (with OG image)
    const shareText = [
      `🏢 ${pg.name}`,
      pg.type === "ladies" ? "👩‍🦰 Ladies PG" : pg.type === "gents" ? "👨‍🦱 Gents PG" : "🤝 Co-Living",
      pg.baseRent ? `💰 Rent from ₹${pg.baseRent.toLocaleString("en-IN")}` : null,
      pg.address ? `📍 ${pg.address}` : null,
    ].filter(Boolean).join("\n");
    if (navigator.share) {
      const firstImg = pg.pgImages?.[0]?.url || pg.pgImages?.[0];
      let filesPayload: { files?: File[] } = {};
      if (firstImg) {
        try {
          const imgRes = await fetch(firstImg);
          const blob = await imgRes.blob();
          const file = new File([blob], `${pg.name.replace(/[^a-zA-Z0-9]/g, "_") || "pg"}.jpg`, { type: blob.type || "image/jpeg" });
          if (navigator.canShare?.({ files: [file] })) filesPayload = { files: [file] };
        } catch { /* image fetch failed, skip */ }
      }
      navigator.share({ title: pg.name, text: shareText, url: pgUrl, ...filesPayload }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${shareText}\n\n${pgUrl}`);
      alert("PG details copied to clipboard!");
    }
  }, []);

  if (isLoading || !isAuthenticated) return null;

  return (
    <main className={styles.main} data-theme={theme}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      {/* Navbar: ← back | theme toggle */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", position: "sticky", top: 0, zIndex: 50,
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      }}>
        <button
          onClick={() => router.push("/find-pg")}
          style={{
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "10px", color: "inherit", width: "38px", height: "38px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "18px", cursor: "pointer",
          }}
        >←</button>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          style={{
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "10px", color: "inherit", width: "38px", height: "38px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", cursor: "pointer",
          }}
        >{theme === "dark" ? "☀️" : "🌙"}</button>
      </div>

      {/* Title + Clear All */}
      <div className={styles.titleBlock} style={{ paddingTop: "24px" }}>
        <h1 className={styles.title}>🔖 Saved PGs</h1>
        <p className={styles.subtitle}>
          {loading
            ? "Loading your saved PGs…"
            : visiblePgs.length > 0
            ? `You have ${visiblePgs.length} saved PG${visiblePgs.length > 1 ? "s" : ""}`
            : "Save PGs you like to find them easily later"}
        </p>
        {!loading && visiblePgs.length > 0 && (
          <button
            onClick={() => setShowClearModal(true)}
            style={{
              marginTop: "10px",
              padding: "7px 18px",
              borderRadius: "20px",
              border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.1)",
              color: "#f87171",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          >
            🗑️ Remove All Saved PGs
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ maxWidth: "900px", margin: "24px auto 0", padding: "0 16px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <span className={styles.spinner} />
          </div>
        ) : visiblePgs.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: "16px", padding: "60px 20px", textAlign: "center"
          }}>
            <div style={{ fontSize: "64px" }}>🤍</div>
            <h3 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>No Saved PGs Yet</h3>
            <p style={{ color: "var(--text-secondary, rgba(255,255,255,0.6))", margin: 0, maxWidth: "300px" }}>
              When you tap the heart icon on a PG, it will be saved here for easy access.
            </p>
            <button
              className={styles.primaryBtn}
              onClick={() => router.push("/find-pg")}
              style={{ marginTop: "8px", minWidth: "180px" }}
            >
              🔍 Find PGs
            </button>
          </div>
        ) : (
          <div className={styles.pgList}>
            {visiblePgs.map((pg, i) => (
              <div
                key={pg.id}
                className={`${styles.pgCard} animate-fade-up`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {/* Card Header — address + desktop save/share */}
                <div className={styles.cardHeader}>
                  {pg.address && (
                    <span className={styles.headerAddressDesk}>
                      <span className={styles.navIcon}>↗</span>{" "}
                      {pg.address.split(",")[0]} <span className={styles.caret}>›</span>
                    </span>
                  )}
                  {/* Desktop: save/share inline in header */}
                  <span className={styles.cardHeaderActions}>
                    <span
                      className={styles.cardHeaderIconBtn}
                      title={owner?.savedPgs?.includes(pg.id) ? "Unsave" : "Save"}
                      onClick={() => { if (toggleSavePg) toggleSavePg(pg.id, !owner?.savedPgs?.includes(pg.id)); }}
                    >
                      {owner?.savedPgs?.includes(pg.id) ? "❤️" : "🤍"}
                    </span>
                    <span
                      className={styles.cardHeaderIconBtn}
                      title="Share"
                      onClick={() => handleShare(pg, { stopPropagation: () => {} } as any)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    </span>
                  </span>
                </div>

                <div className={styles.cardLayout}>
                  {/* Image */}
                  <div className={styles.cardImageArea} onClick={() => openGallery(pg)}>
                    {pg.pgImages && pg.pgImages.length > 0 ? (
                      <img
                        src={pg.pgImages[0]?.url || pg.pgImages[0]}
                        alt={pg.name}
                        className={styles.pgMainImg}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className={styles.pgMainImgPlaceholder}>No Image</div>
                    )}

                    {/* Mobile: save/share on image */}
                    <div className={styles.cardImageActions}>
                      <div
                        className={styles.favBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (toggleSavePg) toggleSavePg(pg.id, !owner?.savedPgs?.includes(pg.id));
                        }}
                      >
                        {owner?.savedPgs?.includes(pg.id) ? "❤️" : "🤍"}
                      </div>
                      <div className={styles.shareBtn} onClick={(e) => handleShare(pg, e)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                      </div>
                    </div>

                    <div className={styles.photosBadge}>
                      🖼 {pg.pgImages?.length || 0} Photos
                    </div>
                  </div>

                  {/* Content */}
                  <div className={styles.cardContentArea}>
                    <h2 className={styles.pgName}>{pg.name}</h2>

                    <div className={styles.pgTypeRow}>
                      <span className={pg.type === "ladies" ? styles.pgTypeLadies : pg.type === "gents" ? styles.pgTypeGents : styles.pgTypeColiving}>
                        {pg.type === "ladies" ? "👩‍🦰 Ladies" : pg.type === "gents" ? "👨‍🦱 Gents" : "🤝 Co-Living"}
                      </span>
                      {pg.baseRent ? (
                        <span className={styles.pgBaseRent}>
                          <span className={styles.rupeeIcon}>₹</span> Rent Starting from ₹{pg.baseRent.toLocaleString("en-IN")}
                        </span>
                      ) : null}
                    </div>

                    {pg.sharings && pg.sharings.length > 0 && (
                      <div className={styles.pgSharings}>
                        {pg.sharings.sort((a: number, b: number) => a - b).map((s: number) => (
                          <span key={s} className={styles.sharingChip}>{s}-Sharing</span>
                        ))}
                      </div>
                    )}

                    {pg.address && (
                      <p className={styles.pgAddress}>📍 {pg.address}</p>
                    )}

                    {/* Buttons — same structure as FindPGPageClient */}
                    <div className={styles.pgCardBtns}>
                      <button className={`${styles.actionBtn} ${styles.actionBtnView}`} onClick={() => openGallery(pg)} id={`btn-view-${pg.id}`}>
                        <span className={styles.actionIcon}>🏢</span>
                        <div className={styles.actionText}>
                          <span className={styles.actionTitle}>View PG</span>
                          <span className={styles.actionSub}>Photos & details</span>
                        </div>
                      </button>

                      <div className={styles.btnDivider} />

                      {pg.managerPhone && (
                        <>
                          <a href={`tel:${pg.managerPhone.replace(/\D/g, "")}`} className={`${styles.actionBtn} ${styles.actionBtnEnquire}`} id={`btn-enquire-${pg.id}`}>
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
                            className={`${styles.actionBtn} ${styles.actionBtnDirections}`}
                            id={`btn-dir-${pg.id}`}
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox – no images */}
      {viewImagesFor && (!viewImagesFor.pgImages || viewImagesFor.pgImages.length === 0) && (
        <div className={styles.imageModalOverlay} onClick={closeGallery}>
          <div className={styles.imageModal} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.imageModalHeader}>
              <h2 className={styles.imageModalTitle}>{viewImagesFor.name}</h2>
              <button className={styles.imageModalClose} onClick={closeGallery}>×</button>
            </div>
            <div className={styles.imageModalBody} style={{ display: "block" }}>
              <div className={styles.noImagesState}>
                <div className={styles.noImagesIcon}>📷</div>
                <h3>No Photos Yet</h3>
                <p>The owner hasn't uploaded any photos.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox – with images */}
      {viewImagesFor && viewImagesFor.pgImages && viewImagesFor.pgImages.length > 0 && (
        <PGPhotoLightbox
          open={true}
          close={closeGallery}
          images={viewImagesFor.pgImages}
        />
      )}

      {/* ── Clear All Confirmation Modal ── */}
      {showClearModal && (
        <div
          onClick={() => setShowClearModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1f2e",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "20px",
              padding: "32px 28px",
              maxWidth: "360px",
              width: "100%",
              textAlign: "center",
              boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗑️</div>
            <h3 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px", color: "#ffffff" }}>
              Remove All Saved PGs?
            </h3>
            <p style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.75)", margin: "0 0 28px", lineHeight: 1.5 }}>
              This will remove all {visiblePgs.length} saved PG{visiblePgs.length > 1 ? "s" : ""} from your list. You can always save them again.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowClearModal(false)}
                style={{
                  flex: 1, padding: "13px", borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#ffffff", fontSize: "15px", fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowClearModal(false);
                  for (const pg of visiblePgs) {
                    if (toggleSavePg) await toggleSavePg(pg.id, false);
                  }
                }}
                style={{
                  flex: 1, padding: "13px", borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(239,68,68,0.35)",
                }}
              >
                Yes, Remove All
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
