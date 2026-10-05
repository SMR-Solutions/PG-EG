"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const MAX_ITEMS = 10;

interface MediaItem {
  url: string;
  fileId: string;
  name?: string;
  caption?: string;
}

function PgMediaInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { owner, token } = useAuth();

  const [tab, setTab] = useState<"images" | "documents">(
    params.get("tab") === "documents" ? "documents" : "images"
  );
  const [pgId, setPgId] = useState<string | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [docName, setDocName] = useState("");
  const [pendingDocFile, setPendingDocFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const authHeader = useCallback((): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {}, [token]);

  const isImages = tab === "images";
  const endpoint = isImages ? "images" : "documents";
  const label = isImages ? "PG Images" : "Important Documents";
  const icon = isImages ? "🖼️" : "🔒";
  const accept = isImages ? "image/*" : "image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt";

  useEffect(() => {
    if (!owner || !token) return;
    async function load() {
      setLoading(true); setError("");
      try {
        const res = await fetch(`${API_URL}/api/pgs/owner/${owner!.id}`, { headers: authHeader() });
        const json = await res.json();
        const firstPg = json.pgs?.[0];
        if (!firstPg) { setError("No PG found. Create a PG first."); setLoading(false); return; }
        setPgId(firstPg.id);
        const r2 = await fetch(`${API_URL}/api/pgs/${firstPg.id}/${endpoint}`, { headers: authHeader() });
        const j2 = await r2.json();
        setItems(isImages ? (j2.images ?? []) : (j2.documents ?? []));
      } catch { setError("Failed to load."); }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, token, tab]);

  async function saveItems(newItems: MediaItem[]) {
    if (!pgId) return;
    const body = isImages ? { images: newItems } : { documents: newItems };
    const res = await fetch(`${API_URL}/api/pgs/${pgId}/${endpoint}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to save");
    return isImages ? (json.images as MediaItem[]) : (json.documents as MediaItem[]);
  }

  async function uploadFile(file: File, nameOverride?: string) {
    if (items.length >= MAX_ITEMS) {
      setError(`Only ${MAX_ITEMS} ${isImages ? "images" : "documents"} allowed. Delete one first.`);
      return;
    }
    // Guard: 30MB max (base64 adds ~33%, so 30MB file ≈ 40MB request, within 50MB server limit)
    const MAX_FILE_MB = 30;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_FILE_MB}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
      return;
    }
    setUploading(true); setError("");
    try {
      // Read file as base64 via Promise (so errors propagate correctly)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });

      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const uploadRes = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          base64,
          fileName: `pg-${isImages ? "img" : "doc"}-${Date.now()}.${ext}`,
          folder: isImages ? `pg-eg/pg-images/${pgId}` : `pg-eg/pg-documents/${pgId}`,
        }),
      });
      // Safe JSON parse — server may return HTML for 413 etc.
      const uploaded = await uploadRes.json().catch(() => ({ error: `Server error (${uploadRes.status}) — file may be too large` }));
      if (!uploadRes.ok) throw new Error(uploaded.error || `Upload error (${uploadRes.status})`);

      const newItem: MediaItem = isImages
        ? { url: uploaded.url, fileId: uploaded.fileId }
        : { url: uploaded.url, fileId: uploaded.fileId, name: nameOverride || file.name };
      const saved = await saveItems([...items, newItem]);
      if (saved) setItems(saved);
      setSuccess(isImages ? "Image uploaded!" : "Document saved to locker!");
      setTimeout(() => setSuccess(""), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(url: string, filename: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: open in new tab
      window.open(url, "_blank");
    }
  }

  async function handleDelete(fileId: string) {
    setConfirmDelete(null);
    setDeleting(fileId);
    try {
      const saved = await saveItems(items.filter(i => i.fileId !== fileId));
      if (saved) setItems(saved);
    } catch { setError("Delete failed."); }
    setDeleting(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    if (!isImages) { setPendingDocFile(file); setDocName(file.name.replace(/\.[^.]+$/, "")); }
    else uploadFile(file);
  }

  if (!owner) return null;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()} id="btn-back">← Back</button>
        <div className={styles.logo}><span className={styles.logoPG}>PG</span><span className={styles.logoDash}>-</span><span className={styles.logoEG}>EG</span></div>
      </header>
      <div className={styles.content}>
        {/* Tabs */}
        <div className={styles.tabRow}>
          <button className={`${styles.tab} ${tab === "images" ? styles.tabActive : ""}`} onClick={() => setTab("images")} id="tab-images">🖼️ PG Images</button>
          <button className={`${styles.tab} ${tab === "documents" ? styles.tabActive : ""}`} onClick={() => setTab("documents")} id="tab-documents">🔒 Documents</button>
        </div>
        {/* Title */}
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{icon} {label}</h1>
          <p className={styles.subtitle}>{isImages ? "Upload photos of your PG to showcase to tenants." : "Store important PG documents privately. Only you can access these."}</p>
          <div className={styles.countBadge}>
            <span style={{ color: items.length >= MAX_ITEMS ? "#e63946" : "#2dc653" }}>{items.length}</span>
            <span> / {MAX_ITEMS}</span>
          </div>
        </div>
        {/* Upload button */}
        {!loading && (
          <button className={styles.uploadBtn} onClick={() => fileRef.current?.click()} disabled={uploading || items.length >= MAX_ITEMS} id="btn-upload-media">
            {uploading ? <><span className={styles.spinner} /> Uploading…</> : items.length >= MAX_ITEMS ? `✋ Max ${MAX_ITEMS} reached` : `+ Upload ${isImages ? "Image" : "Document"}`}
          </button>
        )}
        <input ref={fileRef} type="file" accept={accept} style={{ display: "none" }} onChange={handleFileChange} />
        {/* Doc name modal */}
        {pendingDocFile && (
          <div className={styles.docNameModal}>
            <div className={styles.docNameBox}>
              <p className={styles.docNameLabel}>Name this document</p>
              <input className={styles.docNameInput} value={docName} onChange={e => setDocName(e.target.value)} placeholder="e.g. Rent Agreement, NOC" autoFocus id="input-doc-name" />
              <div className={styles.docNameActions}>
                <button className={styles.docNameCancel} onClick={() => { setPendingDocFile(null); setDocName(""); }}>Cancel</button>
                <button className={styles.docNameSave} disabled={!docName.trim()} onClick={() => { uploadFile(pendingDocFile, docName.trim()); setPendingDocFile(null); setDocName(""); }}>Upload →</button>
              </div>
            </div>
          </div>
        )}
        {error && <p className={styles.errorMsg}>⚠️ {error}</p>}
        {success && <p className={styles.successMsg}>✅ {success}</p>}
        {/* Items */}
        {loading ? (
          <div className={styles.loadingRow}><span className={styles.spinnerLg} /></div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>{isImages ? "📷" : "📁"}</div>
            <p className={styles.emptyText}>No {isImages ? "images" : "documents"} yet</p>
            <p className={styles.emptyHint}>{isImages ? "Upload photos of rooms, amenities, common areas…" : "Rent agreements, NOCs, property documents — all in one private place."}</p>
          </div>
        ) : (
          <div className={isImages ? styles.imageGrid : styles.docList}>
            {items.map((item) => (
              <div key={item.fileId} className={isImages ? styles.imageCard : styles.docCard}>
                {isImages ? (
                  <>
                    <img src={item.url} alt="PG" className={styles.image} />
                    <button className={styles.deleteBtn} onClick={() => setConfirmDelete(item.fileId)} disabled={deleting === item.fileId} title="Delete">✕</button>
                  </>
                ) : (
                  <>
                    <div className={styles.docIcon}>📄</div>
                    <div className={styles.docInfo}>
                      <p className={styles.docName}>{item.name || "Document"}</p>
                      <div className={styles.docActions}>
                        <a href={item.url} target="_blank" rel="noreferrer" className={styles.docViewBtn}>👁 View</a>
                        <button onClick={() => handleDownload(item.url, item.name || "document")} className={styles.docDownloadBtn}>⬇ Download</button>
                      </div>
                    </div>
                    <button className={styles.deleteBtn} onClick={() => setConfirmDelete(item.fileId)} disabled={deleting === item.fileId} title="Delete">✕</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {!isImages && !loading && (
          <div className={styles.privateNotice}>🔒 These documents are <strong>private</strong>. Only you (the PG owner) can see them.</div>
        )}
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <div className={styles.confirmIcon}>🗑️</div>
            <p className={styles.confirmTitle}>Delete this {isImages ? "image" : "document"}?</p>
            <p className={styles.confirmSub}>This cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmNo} onClick={() => setConfirmDelete(null)}>No, Keep it</button>
              <button className={styles.confirmYes} onClick={() => handleDelete(confirmDelete)} disabled={!!deleting}>
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function PgMediaPage() {
  return <Suspense fallback={null}><PgMediaInner /></Suspense>;
}
