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
  const { isAuthenticated, hasPG, isLoading, role } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  // If already logged in, auto-redirect based on role
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (role === "user") {
        router.replace("/find-pg");
      } else {
        router.replace(hasPG ? "/dashboard" : "/add-pg");
      }
    }
  }, [isLoading, isAuthenticated, hasPG, role, router]);

  // Capture the PWA install prompt
  useEffect(() => {
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
      <div className={styles.orb3} />

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

      {/* ════════════════════ HERO ════════════════════ */}
      <div className={styles.hero}>

        {/* Logo */}
        <div className={`${styles.logoWrap} animate-fade-up`}>
          <AppLogo size="lg" />
          <p className={styles.tagline}>Searching PG?🧐 — It&apos;s Very Easy😎.</p>
        </div>

        {/* ── FIND PG — main CTA ── */}
        <div className={`${styles.ctaWrap} animate-fade-up delay-1`}>
          <button
            className={styles.findBtn}
            id="btn-find-pg"
            onClick={() => router.push("/sign-in?from=/find-pg&role=user")}
          >
            <span className={styles.findBtnIcon}>🔍</span>
            <div className={styles.findBtnText}>
              <span className={styles.findBtnTitle}>Find PG Near Me</span>
              <span className={styles.findBtnSub}>For students &amp; working professionals</span>
            </div>
            <span className={styles.findBtnArrow}>→</span>
          </button>

          <p className={styles.ctaHint}>
            📍 Near your college · 🏢 Near your workplace · 🔗 Paste any Maps link
          </p>
        </div>
      </div>

      {/* ════════════════════ INFO FOOTER ════════════════════ */}
      <footer className={styles.infoFooter}>

        {/* ── For seekers ── */}
        <div className={`${styles.footerSection} animate-fade-up delay-2`}>
          <div className={styles.footerIcon}>🎓</div>
          <div className={styles.footerBody}>
            <h3 className={styles.footerTitle}>Find PGs instantly — anywhere</h3>
            <p className={styles.footerDesc}>
              Share your location or drop a Google Maps link of your college, office, or
              any landmark. PG-EG instantly shows you the nearest registered PGs with
              distances, sharing types, and a one-tap route to each one.
              No sign-up needed to browse — just search and go.
            </p>
            <div className={styles.footerChips}>
              <span className={styles.chip}>📍 GPS search</span>
              <span className={styles.chip}>🏫 Near college</span>
              <span className={styles.chip}>🏢 Near office</span>
              <span className={styles.chip}>🔗 Maps link</span>
              <span className={styles.chip}>🗺️ One-tap directions</span>
            </div>
          </div>
        </div>

        <div className={styles.footerDivider} />

        {/* ── For owners ── */}
        <div className={`${styles.footerSection} animate-fade-up delay-3`}>
          <div className={styles.footerIcon}>🏗️</div>
          <div className={styles.footerBody}>
            <h3 className={styles.footerTitle}>PG Owners — manage everything digitally</h3>
            <p className={styles.footerDesc}>
              Register your PG once and let students find you automatically. Build your
              PG as a real <strong>3D digital structure</strong> — floors, rooms, beds and
              tenants — all in your mobile. Know exactly which bed is occupied, which rent
              is due, and who lives where, from anywhere.
            </p>
            <div className={styles.footerChips}>
              <span className={styles.chip}>🏢 3D building view</span>
              <span className={styles.chip}>🛏️ Beds &amp; rooms</span>
              <span className={styles.chip}>👤 Tenant records</span>
              <span className={styles.chip}>💰 Rent tracking</span>
              <span className={styles.chip}>🔒 Data safety</span>
            </div>
          </div>
        </div>

        <div className={styles.footerDivider} />

        {/* ── Bottom strip ── */}
        <div className={styles.footerBottom}>
          <p className={styles.footerMeta}>Built for PG owners &amp; tenants across India 🇮🇳</p>

          {/* Hidden-in-plain-sight ADD PG button — only owners know to look */}
          <button
            className={styles.addPgSlice}
            id="btn-add-pg"
            onClick={() => router.push("/add-pg/pg-details?new=true")}
          >
            🏠 I own a PG — Add it here
          </button>
        </div>
      </footer>
    </main>
  );
}
