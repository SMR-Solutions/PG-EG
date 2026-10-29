import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { BANGALORE_LOCATIONS, getLocationBySlug } from "@/data/bangaloreLocations";
import { APP_URL, API_URL } from "@/lib/siteConfig";
import LocalityListingClient, { PublicPG } from "./LocalityListingClient";
import styles from "../bangalore.module.css";
import AppLogo from "@/components/AppLogo";

export const revalidate = 3600; // ISR: revalidate cache every hour

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return BANGALORE_LOCATIONS.map((loc) => ({
    slug: loc.slug,
  }));
}

async function fetchNearbyPGs(lat: number, lng: number, radiusKm: number): Promise<PublicPG[]> {
  try {
    const res = await fetch(`${API_URL}/api/public/pgs/nearby?lat=${lat}&lng=${lng}&radius=${radiusKm}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (error) {
    console.warn("Could not fetch nearby PGs during SSR:", error);
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const loc = getLocationBySlug(slug);

  if (!loc) {
    return {
      title: "Bangalore PG Directory | PG-EG",
      description: "Find verified PGs in Bangalore with zero brokerage on PG-EG.",
    };
  }

  const title = `${loc.headline} | PG-EG Bangalore`;
  const description = `${loc.subheadline} Compare rents, food, amenities & get zero-brokerage contact details on PG-EG.`;
  const pageUrl = `${APP_URL}/bangalore/${loc.slug}`;

  return {
    title,
    description,
    keywords: [
      ...loc.targetKeywords,
      "PG-EG",
      "PGEG",
      "pgeg",
      "pg near me",
      "pgs near me",
      "bangalore pg finder",
      "zero brokerage pg bangalore",
    ],
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "PG-EG",
      type: "website",
      images: [
        {
          url: `${APP_URL}/pg-eg-logo-wide.png`,
          width: 1200,
          height: 630,
          alt: `PGs in ${loc.name} Bangalore - PG-EG`,
        },
      ],
      locale: "en_IN",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${APP_URL}/pg-eg-logo-wide.png`],
    },
  };
}

export default async function BangaloreLocalityPage({ params }: Props) {
  const { slug } = await params;
  const loc = getLocationBySlug(slug);

  if (!loc) {
    notFound();
  }

  const pgs = await fetchNearbyPGs(loc.lat, loc.lng, loc.radiusKm);
  const pageUrl = `${APP_URL}/bangalore/${loc.slug}`;

  // ─── 1. BREADCRUMB SCHEMA ───
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: APP_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Bangalore PGs",
        item: `${APP_URL}/bangalore`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: loc.name,
        item: pageUrl,
      },
    ],
  };

  // ─── 2. FAQ SCHEMA ───
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: loc.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };

  // ─── 3. ITEMLIST SCHEMA (Real Listings) ───
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `PGs in ${loc.name}, Bangalore`,
    description: loc.subheadline,
    numberOfItems: pgs.length,
    itemListElement: pgs.map((pg, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: pg.name,
      url: `${APP_URL}/pg/${pg.id}`,
    })),
  };

  // ─── 4. PLACE / GEO SCHEMA ───
  const placeSchema = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: loc.name,
    geo: {
      "@type": "GeoCoordinates",
      latitude: loc.lat,
      longitude: loc.lng,
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: loc.shortName,
      addressRegion: "Karnataka",
      addressCountry: "IN",
    },
  };

  // Related locations for PageRank distribution
  const relatedLocations = BANGALORE_LOCATIONS.filter((l) => l.slug !== loc.slug).slice(0, 8);

  return (
    <div className={styles.container}>
      {/* ─── Structured Data (JSON-LD) ─── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {pgs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(placeSchema) }}
      />

      <div className={styles.inner}>
        {/* ─── Header Navigation ─── */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSeparator}>/</span>
          <Link href="/bangalore">Bangalore</Link>
          <span className={styles.breadcrumbSeparator}>/</span>
          <span className={styles.breadcrumbActive}>{loc.name}</span>
        </nav>

        {/* ─── Hero Section ─── */}
        <header className={styles.hero}>
          <div className={styles.heroTag}>
            📍 Bangalore Town · {loc.category === "tech-park" ? "Tech Park Corridor" : loc.category === "college" ? "College Zone" : "Prime Locality"}
          </div>
          <h1 className={styles.h1}>{loc.headline}</h1>
          <p className={styles.subheadline}>{loc.subheadline}</p>

          <div className={styles.heroChips}>
            <span className={styles.heroChip}>⚡ Zero Brokerage</span>
            <span className={styles.heroChip}>🍽️ 3-Times Daily Meals</span>
            <span className={styles.heroChip}>📶 High Speed WiFi</span>
            <span className={styles.heroChip}>🛡️ CCTV &amp; Security</span>
          </div>
        </header>

        {/* ─── PG Listing Stream (SSR + Client Filter) ─── */}
        <main>
          <LocalityListingClient pgs={pgs} locationName={loc.name} />

          {/* ─── Locality Overview / SEO Guide ─── */}
          <section className={styles.seoGuide} aria-labelledby="guide-title">
            <h2 id="guide-title" className={styles.guideTitle}>
              Living in {loc.name}, Bangalore
            </h2>
            <p className={styles.guideText}>{loc.overviewText}</p>

            <ul className={styles.highlightsList}>
              {loc.highlights.map((h, i) => (
                <li key={i} className={styles.highlightItem}>
                  <span>✅</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ─── FAQs with FAQPage Schema Alignment ─── */}
          <section className={styles.faqSection} aria-labelledby="faq-title">
            <h2 id="faq-title" className={styles.faqHeading}>
              Frequently Asked Questions about PGs in {loc.name}
            </h2>
            <div className={styles.faqList}>
              {loc.faqs.map((f, i) => (
                <article key={i} className={styles.faqItem}>
                  <h3 className={styles.faqQuestion}>{f.question}</h3>
                  <p className={styles.faqAnswer}>{f.answer}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ─── Internal Linking Cluster ─── */}
          <section className={styles.crossLinksSection}>
            <h3 className={styles.crossLinksTitle}>Explore More PGs in Bangalore</h3>
            <div className={styles.crossLinksGrid}>
              {relatedLocations.map((rel) => (
                <Link key={rel.slug} href={`/bangalore/${rel.slug}`} className={styles.crossLinkPill}>
                  {rel.category === "tech-park" ? "🏢" : rel.category === "college" ? "🎓" : "📍"} {rel.name}
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

