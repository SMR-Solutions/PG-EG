"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AppLogo from "@/components/AppLogo";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function OwnerProfilePage() {
  const router = useRouter();
  const { owner, token, refreshAuth } = useAuth();

  // Email login: owner.email is a real email
  // Phone login: owner.email is null/undefined
  const isEmailLogin = !!(owner?.email && owner.email.includes("@"));

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [consentRevoking, setConsentRevoking] = useState(false);
  const [consentMsg, setConsentMsg]  = useState("");  // success message
  const [consentErr, setConsentErr]  = useState("");  // error message

  // Consent version constant — matches server and SignInForm
  const CURRENT_CONSENT_VERSION = 1;
  const LS_CONSENT_KEY = "pg_eg_consent_v";
  const isUser = owner?.role === "user";
  const consentUpToDate = isUser && owner?.consentVersion === CURRENT_CONSENT_VERSION;

  // ─── Live View & PG State ───
  const [pgId, setPgId] = useState<string | null>(null);
  const [liveVideoUrl, setLiveVideoUrl] = useState<string | null>(null);
  const [liveVideo, setLiveVideo] = useState<{ url: string; fileId?: string; duration?: number } | null>(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [pendingDuration, setPendingDuration] = useState<number>(0);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [deletingVideo, setDeletingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [videoSuccess, setVideoSuccess] = useState("");

  const photoRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authHeader = (): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (owner) {
      setPhone(owner.phone?.replace(/\D/g, "").slice(-10) ?? "");
      setEmail(owner.email ?? "");
      setPhotoUrl(owner.photoUrl ?? null);
    }
  }, [owner]);

  // Load Owner's PG for Live View
  useEffect(() => {
    if (!owner || !token) return;
    async function loadOwnerPg() {
      try {
        const res = await fetch(`${API_URL}/api/pgs/owner/${owner!.id}`, { headers: authHeader() });
        const json = await res.json();
        const firstPg = json.pgs?.[0];
        if (firstPg) {
          setPgId(firstPg.id);
          setLiveVideoUrl(firstPg.liveVideoUrl || null);
          setLiveVideo(firstPg.liveVideo || null);
        }
      } catch {
        // silent
      }
    }
    loadOwnerPg();
  }, [owner, token]);

  function closeLiveModal() {
    if (uploadingVideo) return;
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      setPendingPreviewUrl(null);
    }
    setPendingFile(null);
    setIsReplacing(false);
    setVideoError("");
    setVideoSuccess("");
    setShowLiveModal(false);
  }

  function handleVideoSelected(file: File) {
    setVideoError("");
    setVideoSuccess("");
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      setPendingPreviewUrl(null);
    }
    setPendingFile(null);

    // Validate size: up to 65MB uncompressed original video
    const MAX_MB = 65;
    if (file.size > MAX_MB * 1024 * 1024) {
      setVideoError(`Video file is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please keep it under ${MAX_MB}MB.`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = objectUrl;

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setPendingFile(file);
        setPendingPreviewUrl(objectUrl);
        setPendingDuration(7.5);
      }
    }, 3500);

    tempVideo.onloadedmetadata = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const dur = tempVideo.duration;

      if (!dur || isNaN(dur)) {
        setPendingFile(file);
        setPendingPreviewUrl(objectUrl);
        setPendingDuration(7.5);
        return;
      }

      if (dur < 5) {
        URL.revokeObjectURL(objectUrl);
        setVideoError(`⚠️ Video is too short (${dur.toFixed(1)}s). Live view video must be at least 5 seconds.`);
        return;
      }

      if (dur > 11) { // 10s with 1s grace margin
        URL.revokeObjectURL(objectUrl);
        setVideoError(`⚠️ Video is too long (${Math.round(dur)}s). Live view is restricted to 5–10 seconds. Please record or choose a 5–10 second clip.`);
        return;
      }

      setPendingFile(file);
      setPendingPreviewUrl(objectUrl);
      setPendingDuration(dur);
    };

    tempVideo.onerror = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      setPendingFile(file);
      setPendingPreviewUrl(objectUrl);
      setPendingDuration(7.5);
    };
  }

  async function handleUploadLiveVideo() {
    if (!pendingFile) return;
    if (!pgId) {
      setVideoError("No PG found on your account. Please create your PG first.");
      return;
    }
    setUploadingVideo(true);
    setVideoError("");

    try {
      // Read raw uncompressed video as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error("Could not read video file."));
        reader.readAsDataURL(pendingFile);
      });

      const ext = pendingFile.name.split(".").pop()?.toLowerCase() || "mp4";
      const uploadRes = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          base64,
          fileName: `pg-live-${pgId}-${Date.now()}.${ext}`,
          folder: `pg-eg/pg-live-videos/${pgId}`,
        }),
      });

      const uploaded = await uploadRes.json().catch(() => ({ error: `Upload error (${uploadRes.status})` }));
      if (!uploadRes.ok) throw new Error(uploaded.error || "Failed to upload video");

      const durRounded = Math.round(pendingDuration * 10) / 10;
      const patchRes = await fetch(`${API_URL}/api/pgs/${pgId}/live-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          liveVideoUrl: uploaded.url,
          liveVideo: {
            url: uploaded.url,
            fileId: uploaded.fileId,
            duration: durRounded,
          },
        }),
      });

      const patchJson = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) throw new Error(patchJson.error || "Failed to save live video to PG details");

      setLiveVideoUrl(uploaded.url);
      setLiveVideo({
        url: uploaded.url,
        fileId: uploaded.fileId,
        duration: durRounded,
      });

      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        setPendingPreviewUrl(null);
      }
      setPendingFile(null);
      setIsReplacing(false);
      setVideoSuccess("🎉 Live View video saved successfully in original quality!");
      setTimeout(() => setVideoSuccess(""), 3500);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleDeleteLiveVideo() {
    if (!pgId) return;
    if (!window.confirm("Are you sure you want to remove the Live View video for your PG?")) return;
    setDeletingVideo(true);
    setVideoError("");

    try {
      const res = await fetch(`${API_URL}/api/pgs/${pgId}/live-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          liveVideoUrl: null,
          liveVideo: null,
        }),
      });
      if (!res.ok) throw new Error("Failed to remove live video");
      setLiveVideoUrl(null);
      setLiveVideo(null);
      setIsReplacing(false);
      setVideoSuccess("Live View video removed.");
      setTimeout(() => setVideoSuccess(""), 3000);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingVideo(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    setUploading(true);
    setError("");
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const res = await fetch(`${API_URL}/api/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ base64, fileName: `owner-${owner?.id}.jpg`, folder: "pg-eg/owners" }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) setPhotoUrl(json.url);
        else setError(json.error || "Upload failed");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); setError("Upload failed"); }
  }

  async function handleSave() {
    if (!owner) return;
    setError("");
    if (isEmailLogin && phone && phone.length !== 10) {
      setError("Mobile number must be 10 digits"); return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { photoUrl };
      if (isEmailLogin) {
        if (phone) body.phone = `+91${phone}`;
      } else {
        body.email = email || null;
      }
      const res = await fetch(`${API_URL}/api/owners/${owner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Server error (${res.status})`);
      await refreshAuth();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally { setSaving(false); }
  }

  async function handleRevokeConsent() {
    if (!token) return;
    setConsentMsg("");
    setConsentErr("");
    if (!window.confirm(
      "Withdraw consent? You will need to agree again before using Save, Share, Enquire, and Directions."
    )) return;
    setConsentRevoking(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/revoke-consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Server error (${res.status})`);
      // Clear local consent hint so sign-in shows consent screen again
      localStorage.removeItem(LS_CONSENT_KEY);
      // Refresh context so owner.consentVersion updates in the UI
      await refreshAuth();
      setConsentMsg("Consent withdrawn. You remain signed in. Consent will be required next time you use Save, Share, Enquire, or Directions.");
    } catch (err) {
      setConsentErr(err instanceof Error ? err.message : "Failed to revoke consent");
    } finally {
      setConsentRevoking(false);
    }
  }

  if (!owner) return null;

  const displayName = owner.name || "Owner";
  const initials = displayName[0].toUpperCase();

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()} id="btn-back">&#8592; Back</button>
        {/* <AppLogo size="sm" /> */}
        {/* <h1 className={styles.pageTitle}>Profile</h1> */}
      </header>
      <div className={styles.content}>
        <div className={styles.photoSection}>
          <button className={styles.avatarWrap} onClick={() => photoRef.current?.click()}
            disabled={uploading} id="btn-change-photo" title="Change profile picture">
            {photoUrl
              ? <img src={photoUrl} alt="Profile" className={styles.avatarImg} />
              : <div className={styles.avatarInitials}>{initials}</div>}
            <div className={styles.avatarOverlay}>
              {uploading ? <span className={styles.spinner} /> : "📷"}
            </div>
          </button>
          <input ref={photoRef} type="file" accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
          <p className={styles.photoHint}>Tap to change photo</p>
        </div>

        <div className={styles.fieldGroup}>
          <p className={styles.fieldLabel}>Full Name</p>
          <div className={styles.fieldReadonly}><span>{displayName}</span><span className={styles.lockBadge}>🔒</span></div>
          <p className={styles.fieldHint}>Name is set during registration</p>
        </div>

        <div className={styles.fieldGroup}>
          <p className={styles.fieldLabel}>📞 Mobile Number</p>
          {!isEmailLogin ? (
            <>
              <div className={styles.fieldReadonly}>
                <span>+91 {owner.phone?.replace(/\D/g, "").slice(-10) || "—"}</span>
                <span className={styles.lockBadge}>🔒 Login number</span>
              </div>
              <p className={styles.fieldHint}>Your login number cannot be changed</p>
            </>
          ) : (
            <>
              <div className={styles.inputWrap}>
                <span className={styles.inputPrefix}>+91</span>
                <input type="tel" inputMode="numeric" maxLength={10} value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile" className={styles.input} id="input-phone" />
              </div>
              <p className={styles.fieldHint}>Optional — add a phone number to your account</p>
            </>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <p className={styles.fieldLabel}>✉️ Email Address</p>
          {isEmailLogin ? (
            <>
              <div className={styles.fieldReadonly}>
                <span>{owner.email}</span>
                <span className={styles.lockBadge}>🔒 Login email</span>
              </div>
              <p className={styles.fieldHint}>Your Google login email cannot be changed</p>
            </>
          ) : (
            <>
              <input type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com (optional)"
                className={styles.input} id="input-email" />
              <p className={styles.fieldHint}>Optional — add an email address to your account</p>
            </>
          )}
        </div>

        {/* ─── PG Media & Digital Locker ─── */}
        {/* 1. LIVE VIEW (Top, Full Width) */}
        <div style={{ display: "flex", marginTop: 4 }}>
          <button
            type="button"
            className={`${styles.mediaBtn} ${styles.mediaBtnLiveView}`}
            onClick={() => {
              setVideoError("");
              setVideoSuccess("");
              setShowLiveModal(true);
            }}
            id="btn-live-view"
            style={{ flex: 1 }}
          >
            <div className={styles.liveHeaderRow}>
              <span className={styles.livePulseDot} />
              <span className={styles.liveBtnTitle}>LIVE VIEW</span>
              {liveVideoUrl && <span className={styles.liveActiveBadge}>Active</span>}
            </div>
            <span className={styles.liveBtnSubtitle}>
              {liveVideoUrl
                ? "📹 5–10s Live Location Video Active • Tap to view"
                : "Upload a 5–10 sec video of your live location & neighbourhood"}
            </span>
          </button>
        </div>

        {/* 2. PG Images & Important Documents Row */}
        <div style={{ display: "flex", gap: 12, marginTop: -4 }}>
          <button
            className={styles.mediaBtn}
            onClick={() => router.push("/owner-profile/pg-media?tab=images")}
            id="btn-pg-images"
          >
            <span className={styles.mediaBtnIcon}>🖼️</span>
            <span className={styles.mediaBtnLabel}>PG Images</span>
          </button>
          <button
            className={`${styles.mediaBtn} ${styles.mediaBtnLocker}`}
            onClick={() => router.push("/owner-profile/pg-media?tab=documents")}
            id="btn-pg-documents"
          >
            <span className={styles.mediaBtnIcon}>🔒</span>
            <span className={styles.mediaBtnLabel}>Important Documents</span>
          </button>
        </div>

        {/* 3. Payment — UPI & Number Row (Full Width) */}
        <div style={{ display: "flex", marginTop: -4 }}>
          <button
            className={`${styles.mediaBtn} ${styles.mediaBtnPayment}`}
            onClick={() => router.push("/owner-profile/payment")}
            id="btn-payment"
            style={{ flex: 1 }}
          >
            <span className={styles.mediaBtnIcon}>💳</span>
            <span className={styles.mediaBtnLabel}>Payment — UPI &amp; Number</span>
          </button>
        </div>

        {error && <p className={styles.errorMsg}>⚠️ {error}</p>}
        {success && <p className={styles.successMsg}>✅ Profile updated!</p>}

        {/* ─── Hidden Inputs for Camera and File Upload ─── */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleVideoSelected(f);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleVideoSelected(f);
            e.target.value = "";
          }}
        />

        {/* ─── LIVE VIEW MODAL ─── */}
        {showLiveModal && (
          <div className={styles.modalBackdrop} onClick={(e) => {
            if (e.target === e.currentTarget) closeLiveModal();
          }}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitleWrap}>
                  <span className={styles.livePulseDot} />
                  <h3 className={styles.modalTitle}>Live Location View</h3>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={closeLiveModal}
                  disabled={uploadingVideo}
                  id="btn-close-live-modal"
                >
                  ✕
                </button>
              </div>

              {uploadingVideo ? (
                <div className={styles.uploadingBox}>
                  <div className={styles.spinnerLarge} />
                  <h4 style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 800 }}>Saving Live Video…</h4>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Uploading your original uncompressed video to cloud storage.<br />
                    Preserving 100% clarity of your building exterior &amp; neighbourhood.
                  </p>
                </div>
              ) : pendingFile && pendingPreviewUrl ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className={styles.videoPreviewBox}>
                    <video
                      src={pendingPreviewUrl}
                      controls
                      autoPlay
                      muted
                      playsInline
                      loop
                      className={styles.videoPlayer}
                    />
                    <div className={styles.videoOverlayBadge}>
                      <span className={styles.livePulseDot} /> PREVIEW
                    </div>
                  </div>

                  <div className={styles.videoPillsRow}>
                    <span className={`${styles.videoPill} ${styles.videoPillSuccess}`}>
                      ⏱️ {pendingDuration.toFixed(1)}s (Allowed: 5–10s)
                    </span>
                    <span className={`${styles.videoPill} ${styles.videoPillQuality}`}>
                      💎 {(pendingFile.size / (1024 * 1024)).toFixed(1)} MB • Original Quality
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    ✨ No compression applied — your building entrance &amp; neighbourhood street view will be stored in full crisp quality.
                  </p>

                  {videoError && <p className={styles.alertError}>{videoError}</p>}

                  <div className={styles.actionsRow}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => {
                        if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
                        setPendingPreviewUrl(null);
                        setPendingFile(null);
                      }}
                      disabled={uploadingVideo}
                    >
                      ↩ Pick Different
                    </button>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={handleUploadLiveVideo}
                      disabled={uploadingVideo}
                      id="btn-save-live-video"
                    >
                      {uploadingVideo ? "Uploading…" : "✅ Confirm & Save Video"}
                    </button>
                  </div>
                </div>
              ) : liveVideoUrl && !isReplacing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className={styles.videoPreviewBox}>
                    <video
                      src={liveVideoUrl}
                      controls
                      playsInline
                      autoPlay
                      muted
                      loop
                      className={styles.videoPlayer}
                    />
                    <div className={styles.videoOverlayBadge}>
                      <span className={styles.livePulseDot} /> LIVE VIEW ACTIVE
                    </div>
                  </div>

                  <div className={styles.videoPillsRow}>
                    <span className={`${styles.videoPill} ${styles.videoPillSuccess}`}>
                      ✓ Live Location Active
                    </span>
                    {liveVideo?.duration && (
                      <span className={styles.videoPill}>
                        ⏱️ {liveVideo.duration}s duration
                      </span>
                    )}
                    <span className={`${styles.videoPill} ${styles.videoPillQuality}`}>
                      💎 Full Original Quality
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Tenants viewing your PG will be able to see this live location clip showing your building from outside and the surrounding street.
                  </p>

                  {videoSuccess && <p className={styles.alertSuccess}>{videoSuccess}</p>}
                  {videoError && <p className={styles.alertError}>{videoError}</p>}

                  <div className={styles.actionsRow}>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={handleDeleteLiveVideo}
                      disabled={deletingVideo}
                      id="btn-delete-live-video"
                    >
                      {deletingVideo ? "Deleting…" : "🗑️ Remove Video"}
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => setIsReplacing(true)}
                      id="btn-replace-live-video"
                    >
                      🔄 Replace Video
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.choiceContainer}>
                  <p className={styles.modalDesc}>
                    Upload a <strong>5–10 second video</strong> of your live location showing your building from outside and neighbourhood.
                  </p>

                  {videoError && <p className={styles.alertError}>{videoError}</p>}
                  {videoSuccess && <p className={styles.alertSuccess}>{videoSuccess}</p>}

                  <div className={styles.choiceGrid}>
                    <button
                      type="button"
                      className={`${styles.choiceCard} ${styles.choiceCardCamera}`}
                      onClick={() => cameraInputRef.current?.click()}
                      id="btn-choose-camera"
                    >
                      <span className={styles.choiceIcon}>📹</span>
                      <span className={styles.choiceTitle}>Camera</span>
                      <span className={styles.choiceDesc}>Record 5–10s live clip now</span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.choiceCard} ${styles.choiceCardUpload}`}
                      onClick={() => fileInputRef.current?.click()}
                      id="btn-choose-upload"
                    >
                      <span className={styles.choiceIcon}>📁</span>
                      <span className={styles.choiceTitle}>Upload</span>
                      <span className={styles.choiceDesc}>Pick recorded 5–10s video</span>
                    </button>
                  </div>

                  <div className={styles.guidelinesBox}>
                    <p className={styles.guidelineTitle}>💡 Important Guidelines</p>
                    <ul className={styles.guidelineList}>
                      <li><strong>5–10 seconds strictly:</strong> Video duration must be between 5 and 10 seconds. Longer videos will be restricted.</li>
                      <li><strong>No compression:</strong> We save 100% original quality so your building &amp; street view are crystal clear.</li>
                      <li><strong>Exterior &amp; Street:</strong> Record your building from outside and the surrounding neighbourhood.</li>
                    </ul>
                  </div>

                  {isReplacing && (
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => {
                        setIsReplacing(false);
                        setVideoError("");
                      }}
                    >
                      Cancel &amp; Keep Current Video
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Data & Consent (role=user only) ─── */}
        {isUser && (
          <div className={styles.consentSection}>
            <p className={styles.consentTitle}>🔒 Data &amp; Consent</p>
            <p className={styles.consentDesc}>
              PG-EG uses your browsing activity to calculate interest metrics for PG owners.
              Owners see aggregate counts only — never your personal details from browsing.
              You agreed to this when you signed in.
            </p>
            <span
              className={`${styles.consentStatus} ${
                consentUpToDate ? styles.consentStatusActive : styles.consentStatusNone
              }`}
            >
              {consentUpToDate ? "✅ Consent given" : "⏹️ Consent not recorded"}
            </span>

            {consentMsg && <p className={styles.consentSuccess}>{consentMsg}</p>}
            {consentErr && <p className={styles.consentError}>{consentErr}</p>}

            {consentUpToDate && (
              <button
                id="btn-revoke-consent"
                className={styles.revokeBtn}
                onClick={handleRevokeConsent}
                disabled={consentRevoking}
                type="button"
              >
                {consentRevoking
                  ? <><span className={styles.spinner} /> Withdrawing…</>
                  : "🗑️ Withdraw consent"
                }
              </button>
            )}
          </div>
        )}

        <button className={styles.saveBtn} onClick={handleSave}
          disabled={saving || uploading} id="btn-save-profile">
          {saving ? <><span className={styles.spinnerDark} /> Saving…</> : "✅ SAVE CHANGES"}
        </button>
      </div>
    </main>
  );
}
