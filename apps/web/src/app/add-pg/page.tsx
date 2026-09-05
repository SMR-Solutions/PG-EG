"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function AddPGPage() {
  const [ownerSaved, setOwnerSaved] = useState(false);
  const [pgSaved, setPgSaved] = useState(false);
  const [ownerName, setOwnerName] = useState("");

  useEffect(() => {
    const ownerId = localStorage.getItem("pg_eg_owner_id");
    const name = localStorage.getItem("pg_eg_owner_name");
    const pgId = localStorage.getItem("pg_eg_pg_id");
    if (ownerId) { setOwnerSaved(true); setOwnerName(name || ""); }
    if (pgId) setPgSaved(true);
  }, []);

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>
        {/* Back + Header */}
        <div className={`${styles.header} animate-fade-up`}>
          <Link href="/" className={styles.backBtn} id="btn-back-home">
            ← Back
          </Link>
          <div className={styles.logo}>
            <span className={styles.logoPG}>PG</span>
            <span className={styles.logoDash}>-</span>
            <span className={styles.logoEG}>EG</span>
          </div>
        </div>

        {/* Title */}
        <div className={`${styles.titleBlock} animate-fade-up delay-1`}>
          <h2 className={styles.title}>Let&apos;s set up your PG</h2>
          <p className={styles.subtitle}>
            Start with your details, then tell us about your PG.
          </p>
        </div>

        {/* Step cards */}
        <div className={`${styles.steps} animate-fade-up delay-2`}>
          {/* Owner Details */}
          <Link
            href="/add-pg/owner-details"
            className={`${styles.stepCard} ${ownerSaved ? styles.stepCardDone : ""}`}
            id="btn-owner-details"
          >
            <div className={styles.stepNumber}>01</div>
            <div className={styles.stepIcon}>
              {ownerSaved ? "✅" : "👤"}
            </div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>
                {ownerSaved ? ownerName || "Owner Details" : "Owner Details"}
              </span>
              <span className={styles.stepDesc}>
                {ownerSaved
                  ? "Saved — tap to update"
                  : "Your name, mobile number, and contact info"}
              </span>
            </div>
            <div className={styles.stepArrow}>→</div>
          </Link>

          {/* PG Details */}
          <Link
            href="/add-pg/pg-details"
            className={`${styles.stepCard} ${pgSaved ? styles.stepCardDone : ""} ${!ownerSaved ? styles.stepCardLocked : ""}`}
            id="btn-pg-details"
            onClick={(e) => { if (!ownerSaved) e.preventDefault(); }}
            aria-disabled={!ownerSaved}
          >
            <div className={styles.stepNumber}>02</div>
            <div className={styles.stepIcon}>
              {pgSaved ? "✅" : ownerSaved ? "🏠" : "🔒"}
            </div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>PG Details</span>
              <span className={styles.stepDesc}>
                {pgSaved
                  ? "Saved — tap to update"
                  : ownerSaved
                  ? "PG name, address, rooms, and sharing type"
                  : "Complete Owner Details first"}
              </span>
            </div>
            <div className={styles.stepArrow}>{ownerSaved ? "→" : "🔒"}</div>
          </Link>
        </div>

        {/* Info note */}
        <p className={`${styles.note} animate-fade-up delay-3`}>
          {ownerSaved && pgSaved
            ? "🎉 All set! Both steps are done."
            : ownerSaved
            ? "✅ Owner saved. Now fill in your PG details."
            : "💡 Fill in Owner Details first, then PG Details."}
        </p>
      </div>
    </main>
  );
}
