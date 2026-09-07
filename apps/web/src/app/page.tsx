"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";
import AppLogo from "@/components/AppLogo";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, hasPG, isLoading } = useAuth();

  // If already logged in, go straight to the right place
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(hasPG ? "/dashboard" : "/add-pg");
    }
  }, [isLoading, isAuthenticated, hasPG, router]);

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>
        {/* Logo */}
        <div className={`${styles.logo} animate-fade-up`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <AppLogo size="lg" />
          <p className={styles.tagline}>Making PG maintenance Easy</p>
        </div>

        {/* Divider */}
        <div className={`${styles.divider} animate-fade-up delay-1`} />

        {/* Action Cards */}
        <div className={`${styles.cards} animate-fade-up delay-2`}>
          {/* ADD PG Card — goes to sign-in first */}
          <button
            className={styles.actionCard}
            id="btn-add-pg"
            onClick={() => router.push("/sign-in?from=/add-pg")}
          >
            <div className={styles.cardIcon}>🏠</div>
            <div className={styles.cardInfo}>
              <span className={styles.cardTitle}>ADD PG</span>
              <span className={styles.cardDesc}>I own a PG and want to manage it</span>
            </div>
            <div className={styles.cardArrow}>→</div>
          </button>

          {/* FIND PG Card — coming soon */}
          <div className={`${styles.actionCard} ${styles.actionCardDisabled}`} id="btn-find-pg">
            <div className={styles.cardIcon}>🔍</div>
            <div className={styles.cardInfo}>
              <span className={styles.cardTitle}>
                FIND PG
                <span className={styles.comingSoonBadge}>Coming Soon</span>
              </span>
              <span className={styles.cardDesc}>I&apos;m looking for a PG to stay in</span>
            </div>
            <div className={styles.cardArrow}>→</div>
          </div>
        </div>

        {/* Footer */}
        <p className={`${styles.footer} animate-fade-up delay-3`}>
          Built for PG owners &amp; tenants across India 🇮🇳
        </p>
      </div>
    </main>
  );
}
