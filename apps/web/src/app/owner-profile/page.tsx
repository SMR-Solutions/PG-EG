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

  const photoRef = useRef<HTMLInputElement>(null);
  const authHeader = (): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (owner) {
      setPhone(owner.phone?.replace(/\D/g, "").slice(-10) ?? "");
      setEmail(owner.email ?? "");
      setPhotoUrl(owner.photoUrl ?? null);
    }
  }, [owner]);

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

        {error && <p className={styles.errorMsg}>⚠️ {error}</p>}
        {success && <p className={styles.successMsg}>✅ Profile updated!</p>}

        <button className={styles.saveBtn} onClick={handleSave}
          disabled={saving || uploading} id="btn-save-profile">
          {saving ? <><span className={styles.spinnerDark} /> Saving…</> : "✅ SAVE CHANGES"}
        </button>
      </div>
    </main>
  );
}
