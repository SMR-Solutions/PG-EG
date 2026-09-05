import styles from "./page.module.css";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className={styles.main}>
      {/* Background gradient orbs */}
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>
        {/* Logo */}
        <div className={`${styles.logo} animate-fade-up`}>
          <h1 className={styles.logoText}>
            <span className={styles.logoPG}>PG</span>
            <span className={styles.logoDash}>-</span>
            <span className={styles.logoEG}>EG</span>
          </h1>
          <p className={styles.tagline}>Making PG maintenance Easy</p>
        </div>

        {/* Divider */}
        <div className={`${styles.divider} animate-fade-up delay-1`} />

        {/* Action Cards */}
        <div className={`${styles.cards} animate-fade-up delay-2`}>
          {/* ADD PG Card */}
          <Link href="/add-pg" className={styles.actionCard} id="btn-add-pg">
            <div className={styles.cardIcon}>🏠</div>
            <div className={styles.cardInfo}>
              <span className={styles.cardTitle}>ADD PG</span>
              <span className={styles.cardDesc}>I own a PG and want to manage it</span>
            </div>
            <div className={styles.cardArrow}>→</div>
          </Link>

          {/* FIND PG Card — coming soon */}
          <div className={`${styles.actionCard} ${styles.actionCardDisabled}`} id="btn-find-pg">
            <div className={styles.cardIcon}>🔍</div>
            <div className={styles.cardInfo}>
              <span className={styles.cardTitle}>
                FIND PG
                <span className={styles.comingSoonBadge}>Coming Soon</span>
              </span>
              <span className={styles.cardDesc}>I'm looking for a PG to stay in</span>
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
