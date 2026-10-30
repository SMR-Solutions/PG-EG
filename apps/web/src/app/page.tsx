"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";
import AppLogo from "@/components/AppLogo";

const InstallPwaBanner = dynamic(() => import("@/components/InstallPwaBanner"), { ssr: false });

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, hasPG, isLoading, role } = useAuth();

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

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div className={styles.orb3} />

      {/* ── PWA Install Banner ── */}
      <InstallPwaBanner />

      {/* ════════════════════ HERO ════════════════════ */}
      <div className={styles.heroSection}>
        {/* Soft sky atmospheric backdrop */}
        <div className={styles.heroBgAtmosphere} />

        {/* Left: PG building illustration */}
        <div className={styles.heroBuildingWrap} aria-hidden="true">
          <img
            src="/images/hero-building.png"
            alt=""
            className={styles.heroBuildingImg}
          />
        </div>

        {/* Right: Boy searching for PGs illustration */}
        <div className={styles.heroBoyWrap} aria-hidden="true">
          <img
            src="/images/hero-boy.png"
            alt=""
            className={styles.heroBoyImg}
          />
        </div>

        <div className={styles.hero}>
          {/* Logo */}
          <div className={`${styles.logoWrap} animate-fade-up`}>
            <AppLogo size="lg" />
            <div className={styles.taglineWrap}>
              <span className={styles.taglinePart1}>Searching PG? 🧐</span>
              <span className={styles.taglineDash}> — </span>
              <span className={styles.taglinePart2}>It&apos;s Very Easy 😎.</span>
            </div>
          </div>

          {/* ── FIND PG — main CTA ── */}
          <div className={`${styles.ctaWrap} animate-fade-up delay-1`}>
            <button
              className={styles.findBtn}
              id="btn-find-pg"
              onClick={() => router.push("/find-pg")}
            >
              <span className={styles.findBtnIcon}>🔍</span>
              <div className={styles.findBtnText}>
                <span className={styles.findBtnTitle}>Find PG Near Me</span>
                <span className={styles.findBtnSub}>For students &amp; working professionals</span>
              </div>
              <span className={styles.findBtnArrow}>→</span>
            </button>

            <p className={styles.ctaHint}>
              📍 Near your college · 🏢 Near your workplace
            </p>
          </div>
        </div>
      </div>

      {/* ════════════════════ INFO FOOTER ════════════════════ */}
      <footer className={styles.infoFooter}>

        {/* ── For seekers ── */}
        <div className={`${styles.footerSection} animate-fade-up delay-2`}>
          <div className={styles.footerIcon}>🎓</div>
          <div className={styles.footerBody}>
            <h3 className={styles.footerTitle}><span className={styles.highlight}>Find PGs instantly — anywhere</span></h3>
            <ul className={styles.footerList}>
              <li>Just click &quot;<span className={styles.highlight}>Find PG Near Me</span>&quot; — That&apos;s it.</li>
              <li>Get all the registered <span className={styles.highlight}>PGs near you instantly</span>.</li>
              <li>Select one, see authentic images, call, enquire —&gt; JOIN the PG.</li>
              <li>That <span className={styles.highlight}>simple</span>... <span className={styles.highlight}>no tension</span> , no hassle.</li>
            </ul>
            <div className={styles.footerChips}>
              <span className={styles.chip}>📍 GPS search</span>
              <span className={styles.chip}>🏫 Near college</span>
              <span className={styles.chip}>🏢 Near office</span>
              <span className={styles.chip}>🗺️ One-tap directions</span>
            </div>

            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--brand-green)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                📍 Explore PGs in Bangalore Town:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <a href="/bangalore" className={styles.chip} style={{ color: "var(--brand-green)", fontWeight: 700 }}>
                  All Bangalore PGs →
                </a>
                <a href="/bangalore/pg-in-koramangala" className={styles.chip}>Koramangala</a>
                <a href="/bangalore/pg-in-hsr-layout" className={styles.chip}>HSR Layout</a>
                <a href="/bangalore/pg-in-bellandur" className={styles.chip}>Bellandur</a>
                <a href="/bangalore/pg-in-whitefield" className={styles.chip}>Whitefield</a>
                <a href="/bangalore/pg-in-electronic-city" className={styles.chip}>Electronic City</a>
                <a href="/bangalore/pg-near-rmz-ecospace" className={styles.chip}>Near RMZ Ecospace</a>
                <a href="/bangalore/pg-near-manyata-tech-park" className={styles.chip}>Near Manyata</a>
                <a href="/bangalore/pg-near-christ-university" className={styles.chip}>Near Christ Univ</a>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footerDivider} />

        {/* ── For owners ── */}
        <div className={`${styles.footerSection} animate-fade-up delay-3`}>
          <div className={styles.footerIcon}>🏢</div>
          <div className={styles.footerBody}>
            <h3 className={styles.footerTitle}><span className={styles.highlight}>PG Owners — manage everything digitally</span></h3>
            <ul className={styles.footerList}>
              <li><span className={styles.highlight}>Register your PG</span> once and let students/job-holders find you automatically.</li>
              <li>🏢 <strong><span className={styles.highlight}>Your Building in your Mobile.</span></strong></li>
              <li>All PG details tracked digitally — Building, Floors, Rooms, Beds, and Tenants.</li>
              <li>📸 <span className={styles.highlight}>Upload PG images</span> to increase visibility &amp; trust.</li>
              <li>📄 <strong>SAVE PG Documents safely</strong> in a secure digital vault.</li>
              <li>📅 <span className={styles.highlight}>Send Rent Reminders with one tap via WhatsApp</span>.</li>
              <li>💵 Automated <span className={styles.highlight}><strong>Rent Collection Reports</strong> &amp; balances.</span></li>
              <li>📊 <span className={styles.highlight}><strong>Expenses Tracker</strong></span> — manage everything you spend &amp; plan to save.</li>
            </ul>
            <div className={styles.footerChips}>
              <span className={styles.chip}>🏢 3D Building Management</span>
              <span className={styles.chip}>💰 Rent &amp; Expense Tracking</span>
              <span className={styles.chip}>📊 Financial Reports</span>
              <span className={styles.chip}>🔒 Secure Data Vault</span>
              <span className={styles.chip}>📱 WhatsApp Integration</span>
            </div>
          </div>
        </div>

        <div className={styles.footerDivider} />

        {/* ── Bottom strip ── */}
        <div className={styles.footerBottom}>
          <p className={styles.footerMeta}>Built for PG owners &amp; tenants across India 🇮🇳</p>

          <div className={styles.legalLinks}>
            <a href="/terms" className={styles.legalLink}>Terms of Service</a>
            <span className={styles.legalDot}>•</span>
            <a href="/privacy" className={styles.legalLink}>Privacy Policy</a>
            <span className={styles.legalDot}>•</span>
            <a href="mailto:studentstoreforstudents@gmail.com" className={styles.legalLink}>Support Mail</a>
          </div>

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
