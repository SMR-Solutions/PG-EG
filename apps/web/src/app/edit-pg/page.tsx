"use client";
import AppLogo from "@/components/AppLogo";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface PG {
  id: string;
  name: string;
  type: string;
  totalFloors: number;
  address: string;
  sharings: number[];
  createdAt: string;
}

const TYPE_EMOJI: Record<string, string> = {
  gents: "🚹",
  ladies: "🚺",
  "co-living": "🧑‍🤝‍🧑",
};

export default function EditPGPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, owner, token } = useAuth();
  const [pgs, setPgs] = useState<PG[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPg, setSelectedPg] = useState<PG | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/edit-pg");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!owner?.id) return;
    fetch(`${API_URL}/api/pgs/owner/${owner.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setPgs(data.pgs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner?.id, token]);

  if (authLoading || loading) {
    return (
      <main className={styles.main}>
        <div className={styles.centered}><span className={styles.spinner} /></div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.orb1} /><div className={styles.orb2} />
      <div className={styles.content}>

        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => router.back()} id="btn-back">
            ← Back
          </button>
          <AppLogo />
        </div>

        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Edit PG ✏️</h2>
          <p className={styles.subtitle}>Select a PG to edit its details or rooms.</p>
        </div>

        {/* PG list */}
        {!selectedPg ? (
          <div className={styles.pgList}>
            {pgs.length === 0 && (
              <p className={styles.emptyNote}>No PGs found. Add one first.</p>
            )}
            {pgs.map((pg) => (
              <button
                key={pg.id}
                className={styles.pgCard}
                onClick={() => setSelectedPg(pg)}
                id={`pg-card-${pg.id}`}
              >
                <div className={styles.pgCardIcon}>{TYPE_EMOJI[pg.type] || "🏠"}</div>
                <div className={styles.pgCardInfo}>
                  <div className={styles.pgCardName}>{pg.name}</div>
                  <div className={styles.pgCardMeta}>
                    {pg.type} · {pg.totalFloors} Floor{pg.totalFloors !== 1 ? "s" : ""}
                  </div>
                  {pg.address && (
                    <div className={styles.pgCardAddress}>{pg.address}</div>
                  )}
                </div>
                <div className={styles.pgCardArrow}>→</div>
              </button>
            ))}
          </div>
        ) : (
          /* Edit options for selected PG */
          <div className={styles.editOptions}>
            <div className={styles.selectedPgBanner}>
              <span>{TYPE_EMOJI[selectedPg.type]}</span>
              <div>
                <div className={styles.selectedPgName}>{selectedPg.name}</div>
                <div className={styles.selectedPgMeta}>{selectedPg.type} · {selectedPg.totalFloors} Floors</div>
              </div>
              <button className={styles.changePgBtn} onClick={() => setSelectedPg(null)}>
                Change ↩
              </button>
            </div>

            <div className={styles.optionList}>
              <button
                className={styles.optionCard}
                id="btn-edit-pg-details"
                onClick={() => router.push(`/edit-pg/details?pgId=${selectedPg.id}`)}
              >
                <span className={styles.optionIcon}>📋</span>
                <div>
                  <div className={styles.optionTitle}>PG Details</div>
                  <div className={styles.optionDesc}>Name, type, address, sharing types, floors</div>
                </div>
                <span className={styles.optionArrow}>→</span>
              </button>

              <button
                className={styles.optionCard}
                id="btn-edit-building"
                onClick={() => router.push(`/edit-pg/building?pgId=${selectedPg.id}`)}
              >
                <span className={styles.optionIcon}>🏗️</span>
                <div>
                  <div className={styles.optionTitle}>Rooms &amp; Building</div>
                  <div className={styles.optionDesc}>Add, remove, or rename rooms and beds</div>
                </div>
                <span className={styles.optionArrow}>→</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
