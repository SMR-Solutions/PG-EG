"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";
import AppLogo from "@/components/AppLogo";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, hasPG, isLoading } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  // If already logged in, go straight to the right place
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(hasPG ? "/dashboard" : "/add-pg");
    }
  }, [isLoading, isAuthenticated, hasPG, router]);

  // Capture the PWA install prompt
  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function handleInstall() {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
    } finally {
      setInstalling(false);
      setInstallPrompt(null);
      deferredPrompt.current = null;
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      {/* ── PWA Install Banner ── */}
      {installPrompt && !installed && (
        <div className={styles.installBanner}>
          <button
            className={styles.installBtn}
            onClick={handleInstall}
            disabled={installing}
            id="btn-install-pwa"
          >
            <span className={styles.installIcon}>📲</span>
            <span>{installing ? "Installing…" : "Install App"}</span>
          </button>
        </div>
      )}

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
