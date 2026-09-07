"use client";
import AppLogo from "@/components/AppLogo";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

function AddPGInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?new=true → adding a NEW PG to an existing account (don't redirect to dashboard)
  const isNew = searchParams.get("new") === "true";

  const { isAuthenticated, isLoading, owner, pgId, hasPG } = useAuth();

  // Redirect to sign-in if not logged in
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in?from=/add-pg");
    }
  }, [isLoading, isAuthenticated, router]);

  // If owner already has a PG AND this is NOT the "add new" flow, go to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && hasPG && !isNew) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, hasPG, isNew, router]);

  if (isLoading || !isAuthenticated) return null;

  const ownerName = owner?.name || "";
  const ownerPhone = owner?.phone || "";

  // Google users have their email stored as phone — no real phone yet
  const isGoogleUser = ownerPhone.includes("@");
  const ownerDetailsComplete = !!owner && !isGoogleUser;

  const pgSaved = !!pgId && !isNew;

  // Pass ?new=true through the entire new-PG flow so pages don't lose context
  const ownerDetailsHref = isNew ? "/add-pg/owner-details?new=true" : "/add-pg/owner-details";
  const pgDetailsHref    = isNew ? "/add-pg/pg-details?new=true"    : "/add-pg/pg-details";

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>
        {/* Back + Header */}
        <div className={`${styles.header} animate-fade-up`}>
          <Link href={isNew ? "/dashboard" : "/"} className={styles.backBtn} id="btn-back-home">
            ← Back
          </Link>
          <AppLogo />
        </div>

        {/* Title */}
        <div className={`${styles.titleBlock} animate-fade-up delay-1`}>
          <h2 className={styles.title}>
            {isNew ? "Add Another PG ➕" : "Let\u2019s set up your PG"}
          </h2>
          <p className={styles.subtitle}>
            {isNew
              ? "Register a new property under your account."
              : ownerDetailsComplete
              ? `Welcome back, ${ownerName}! Now add your PG details.`
              : "Start with your details, then tell us about your PG."}
          </p>
        </div>

        {/* Step cards */}
        <div className={`${styles.steps} animate-fade-up delay-2`}>

          {/* Step 01 — Owner Details */}
          <Link
            href={ownerDetailsHref}
            className={`${styles.stepCard} ${ownerDetailsComplete ? styles.stepCardDone : styles.stepCardPending}`}
            id="btn-owner-details"
          >
            <div className={styles.stepNumber}>01</div>
            <div className={styles.stepIcon}>
              {ownerDetailsComplete ? "✅" : isGoogleUser ? "📱" : "👤"}
            </div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>
                {ownerDetailsComplete ? ownerName : "Owner Details"}
              </span>
              <span className={styles.stepDesc}>
                {ownerDetailsComplete
                  ? `✓ ${ownerPhone}`
                  : isGoogleUser
                  ? "Add your name & phone number to continue"
                  : "Your name and mobile number"}
              </span>
            </div>
            <div className={styles.stepArrow}>
              {ownerDetailsComplete ? "✓" : "→"}
            </div>
          </Link>

          {/* Step 02 — PG Details */}
          <Link
            href={pgDetailsHref}
            className={`${styles.stepCard} ${pgSaved ? styles.stepCardDone : ""} ${!ownerDetailsComplete ? styles.stepCardLocked : ""}`}
            id="btn-pg-details"
            onClick={(e) => { if (!ownerDetailsComplete) e.preventDefault(); }}
            aria-disabled={!ownerDetailsComplete}
          >
            <div className={styles.stepNumber}>02</div>
            <div className={styles.stepIcon}>
              {pgSaved ? "✅" : ownerDetailsComplete ? "🏠" : "🔒"}
            </div>
            <div className={styles.stepInfo}>
              <span className={styles.stepTitle}>PG Details</span>
              <span className={styles.stepDesc}>
                {pgSaved
                  ? "Saved — tap to update"
                  : ownerDetailsComplete
                  ? isNew
                    ? "Fill in your new PG info"
                    : "PG name, address, rooms, and sharing type"
                  : "Complete Owner Details first"}
              </span>
            </div>
            <div className={styles.stepArrow}>{ownerDetailsComplete ? "→" : "🔒"}</div>
          </Link>
        </div>

        {/* Status note */}
        <p className={`${styles.note} animate-fade-up delay-3`}>
          {isNew && ownerDetailsComplete
            ? `✅ Signed in as ${ownerName}. Fill in your new PG details to continue.`
            : !ownerDetailsComplete && isGoogleUser
            ? "📱 Signed in via Google — please add your phone number to proceed."
            : ownerDetailsComplete
            ? `✅ Signed in as ${ownerName}. Now fill in your PG details.`
            : "💡 Fill in Owner Details first, then PG Details."}
        </p>
      </div>
    </main>
  );
}

export default function AddPGPage() {
  return (
    <Suspense fallback={null}>
      <AddPGInner />
    </Suspense>
  );
}
