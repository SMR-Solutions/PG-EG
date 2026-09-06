"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

export default function AddPGPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, owner, pgId, hasPG, refreshAuth } = useAuth();

  // Redirect to sign-in if not logged in
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/add-pg");
    }
  }, [isLoading, isAuthenticated, router]);

  // If owner already has a PG, go straight to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && hasPG) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, hasPG, router]);

  if (isLoading || !isAuthenticated) return null;

  const ownerSaved = !!owner;
  const ownerName = owner?.name || "";
  const pgSaved = !!pgId;

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
            {ownerSaved
              ? `Welcome back, ${ownerName}! Now add your PG details.`
              : "Start with your details, then tell us about your PG."}
          </p>
        </div>

        {/* Step cards */}
        <div className={`${styles.steps} animate-fade-up delay-2`}>
          {/* Owner Details — auto-filled from Google sign-in */}
          <div className={`${styles.stepCard} ${ownerSaved ? styles.stepCardDone : ""}`}>
            <div className={styles.stepNumber}>01</div>
            <div className={styles.stepIcon}>{ownerSaved ? "✅" : "👤"}</div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>
                {ownerSaved ? ownerName || "Owner Details" : "Owner Details"}
              </span>
              <span className={styles.stepDesc}>
                {ownerSaved
                  ? "Signed in via Google ✓"
                  : "Your name and contact info"}
              </span>
            </div>
            {ownerSaved && <div className={styles.stepDone}>✓</div>}
          </div>

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
                  : "Sign in first"}
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
            ? "✅ Signed in as " + ownerName + ". Now fill in your PG details."
            : "💡 Sign in first to continue."}
        </p>
      </div>
    </main>
  );
}
