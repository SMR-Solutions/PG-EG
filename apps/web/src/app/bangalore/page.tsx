import type { Metadata } from "next";
import Link from "next/link";
import { BANGALORE_LOCATIONS } from "@/data/bangaloreLocations";
import { APP_URL } from "@/lib/siteConfig";
import styles from "./bangalore.module.css";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "PG in Bangalore — Find Verified Gents & Ladies PGs | PG-EG",
  description:
    "Explore 100+ verified PGs across Bangalore in Koramangala, HSR Layout, Bellandur, Whitefield & Electronic City. Near major tech parks & colleges with zero brokerage.",
  keywords: [
    "pg in bangalore",
    "bangalore pg",
    "pg near me bangalore",
    "ladies pg bangalore",
    "gents pg bangalore",
    "coliving bangalore",
    "PGEG bangalore",
    "pg-eg bangalore",
    "pg near manyata tech park",
    "pg near ecospace",
    "pg near christ university",
  ],
  alternates: {
    canonical: `${APP_URL}/bangalore`,
  },
  openGraph: {
    title: "PG in Bangalore — Verified PGs & Co-Living Spaces | PG-EG",
    description:
      "Find top-rated PGs across Bangalore near your office or college. Real photos, 3D room tours, and direct manager contact.",
    url: `${APP_URL}/bangalore`,
    siteName: "PG-EG",
    type: "website",
    images: [
      {
        url: `${APP_URL}/pg-eg-logo-wide.png`,
        width: 1200,
        height: 630,
        alt: "PG-EG Bangalore PG Finder",
      },
    ],
  },
};

export default function BangaloreDirectoryPage() {
  const localities = BANGALORE_LOCATIONS.filter((l) => l.category === "locality");
  const techParks = BANGALORE_LOCATIONS.filter((l) => l.category === "tech-park");
  const colleges = BANGALORE_LOCATIONS.filter((l) => l.category === "college");

  const directorySchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Bangalore PG Directory - PG-EG",
    description:
      "Comprehensive directory of verified paying guest accommodations, hostels, and co-living homes across Bangalore.",
    url: `${APP_URL}/bangalore`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: BANGALORE_LOCATIONS.map((loc, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: loc.name,
        url: `${APP_URL}/bangalore/${loc.slug}`,
      })),
    },
  };

  return (
    <div className={styles.container}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(directorySchema) }}
      />

      <div className={styles.inner}>
        {/* ─── Breadcrumb ─── */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSeparator}>/</span>
          <span className={styles.breadcrumbActive}>Bangalore PGs</span>
        </nav>

        {/* ─── Hero Section ─── */}
        <header className={styles.hero}>
          <div className={styles.heroTag}>📍 Silicon Valley of India · Bengaluru</div>
          <h1 className={styles.h1}>Paying Guest (PG) Accommodations in Bangalore</h1>
          <p className={styles.subheadline}>
            Discover verified Gents, Ladies, and Co-Living PGs across Bangalore&apos;s leading tech parks, universities, and residential sectors with zero brokerage.
          </p>

          <div className={styles.heroChips}>
            <Link href="/find-pg" className={styles.ctaDetectBtn} style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
              📍 Find PGs Near My Current Location
            </Link>
            <span className={styles.heroChip}>✨ 100% Verified Properties</span>
            <span className={styles.heroChip}>📞 Direct Owner Numbers</span>
          </div>
        </header>

        {/* ─── 1. TECH PARKS & WORKPLACES ─── */}
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.4rem", fontWeight: "700", marginBottom: "0.5rem" }}>
            🏢 PGs Near Bangalore Tech Parks (For IT &amp; Office Professionals)
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.25rem" }}>
            Stay within walking distance of Bangalore&apos;s largest IT corridors to beat the traffic.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {techParks.map((tp) => (
              <Link
                key={tp.slug}
                href={`/bangalore/${tp.slug}`}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.25rem",
                  textDecoration: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ fontSize: "1.3rem" }}>🏢</div>
                <div style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "1.05rem" }}>{tp.name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{tp.subheadline}</div>
                <div style={{ marginTop: "auto", paddingTop: "0.5rem", color: "var(--brand-green)", fontSize: "0.85rem", fontWeight: "600" }}>
                  View Nearby PGs →
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── 2. COLLEGES & UNIVERSITIES ─── */}
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.4rem", fontWeight: "700", marginBottom: "0.5rem" }}>
            🎓 PGs Near Bangalore Colleges &amp; Universities (For Students)
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.25rem" }}>
            Student-friendly hostels and PGs with study halls, high security, and nutritious meals near top universities.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {colleges.map((c) => (
              <Link
                key={c.slug}
                href={`/bangalore/${c.slug}`}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.25rem",
                  textDecoration: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ fontSize: "1.3rem" }}>🎓</div>
                <div style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "1.05rem" }}>{c.name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{c.subheadline}</div>
                <div style={{ marginTop: "auto", paddingTop: "0.5rem", color: "var(--brand-green)", fontSize: "0.85rem", fontWeight: "600" }}>
                  Explore Student PGs →
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── 3. POPULAR RESIDENTIAL LOCALITIES ─── */}
        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "1.4rem", fontWeight: "700", marginBottom: "0.5rem" }}>
            📍 PGs in Top Bangalore Localities
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.25rem" }}>
            From bustling startup sectors to serene residential avenues, find your neighborhood in Bangalore.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {localities.map((loc) => (
              <Link
                key={loc.slug}
                href={`/bangalore/${loc.slug}`}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.25rem",
                  textDecoration: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ fontSize: "1.3rem" }}>📍</div>
                <div style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "1.05rem" }}>{loc.name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{loc.subheadline}</div>
                <div style={{ marginTop: "auto", paddingTop: "0.5rem", color: "var(--brand-green)", fontSize: "0.85rem", fontWeight: "600" }}>
                  Browse {loc.shortName} PGs →
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── BANGALORE CITY PG GUIDE ─── */}
        <section className={styles.seoGuide}>
          <h2 className={styles.guideTitle}>Complete Guide to Finding a PG in Bangalore</h2>
          <p className={styles.guideText}>
            Bangalore (Bengaluru) attracts over half a million students and IT professionals every year. Whether you are stepping into your first tech role in Bellandur or starting your degree at Christ University, choosing the right accommodation determines your commute time, health, and peace of mind.
          </p>
          <ul className={styles.highlightsList}>
            <li className={styles.highlightItem}>
              <span>💡</span>
              <span><strong>Average Rent:</strong> ₹7,500 – ₹13,000 for sharing; ₹14,000 – ₹25,000 for private rooms</span>
            </li>
            <li className={styles.highlightItem}>
              <span>🥘</span>
              <span><strong>Food Culture:</strong> Most PGs provide North &amp; South Indian vegetarian &amp; non-vegetarian menus</span>
            </li>
            <li className={styles.highlightItem}>
              <span>⚡</span>
              <span><strong>Connectivity:</strong> Look for PGs near Namma Metro stations (Purple, Green, Yellow lines)</span>
            </li>
            <li className={styles.highlightItem}>
              <span>🔒</span>
              <span><strong>Zero Brokerage:</strong> PG-EG connects you directly with verified building managers</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

