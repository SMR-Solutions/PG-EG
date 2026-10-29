import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_URL, API_URL } from "@/lib/siteConfig";
import PGDetailClient from "./PGDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

async function fetchPG(id: string) {
  try {
    const res = await fetch(`${API_URL}/api/public/pgs/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const pg = await fetchPG(id);
  if (!pg) return { title: "PG Not Found | PG-EG" };

  const typeLabel =
    pg.type === "ladies" ? "Ladies PG 👩‍🦰" :
    pg.type === "gents"  ? "Gents PG 👨‍🦱"  :
    "Co-Living 🤝";

  const description = [
    typeLabel,
    pg.baseRent ? `Rent from ₹${pg.baseRent.toLocaleString("en-IN")}` : null,
    pg.address  ? `📍 ${pg.address}` : null,
    pg.sharings?.length ? `${pg.sharings.join(", ")}-Sharing available` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const imageUrl =
    pg.pgImages?.[0]?.url ||
    pg.pgImages?.[0] ||
    `${APP_URL}/og-default.jpg`;

  const pageUrl = `${APP_URL}/pg/${id}`;
  const metaTitle = `${pg.name} - PG in ${pg.city || "Bangalore"} | PG-EG`;

  return {
    title: metaTitle,
    description,
    keywords: [
      pg.name,
      `PG in ${pg.city || "Bangalore"}`,
      `${pg.type === "ladies" ? "ladies" : "gents"} pg in ${pg.city || "bangalore"}`,
      "paying guest bangalore",
      "pg near me",
      "PGEG",
      "PG-EG",
      "pgeg",
      "zero brokerage pg",
    ],
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title: metaTitle,
      description,
      url: pageUrl,
      siteName: "PG-EG",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: pg.name }],
      type: "website",
      locale: "en_IN",
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description,
      images: [imageUrl],
    },
  };
}

export default async function PGDetailPage({ params }: Props) {
  const { id } = await params;
  const pg = await fetchPG(id);
  if (!pg) notFound();

  const pageUrl = `${APP_URL}/pg/${id}`;
  const imageUrl =
    pg.pgImages?.[0]?.url ||
    pg.pgImages?.[0] ||
    `${APP_URL}/og-default.jpg`;

  // ─── 1. LODGING BUSINESS SCHEMA ───
  const lodgingSchema = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: pg.name,
    description: pg.description || `${pg.name} paying guest accommodation in ${pg.city || "Bangalore"}.`,
    url: pageUrl,
    image: imageUrl,
    ...(pg.managerPhone ? { telephone: pg.managerPhone } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: pg.address,
      addressLocality: pg.city || "Bangalore",
      addressRegion: "Karnataka",
      addressCountry: "IN",
    },
    ...(pg.latitude && pg.longitude
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: pg.latitude,
            longitude: pg.longitude,
          },
        }
      : {}),
    ...(pg.baseRent
      ? {
          priceRange: `₹${pg.baseRent.toLocaleString("en-IN")}`,
          currenciesAccepted: "INR",
        }
      : {}),
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "High Speed WiFi", value: true },
      { "@type": "LocationFeatureSpecification", name: "3-Time Daily Meals", value: true },
      { "@type": "LocationFeatureSpecification", name: "CCTV Security", value: true },
      { "@type": "LocationFeatureSpecification", name: "Power Backup", value: true },
    ],
  };

  // ─── 2. BREADCRUMB SCHEMA ───
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
        name: pg.name,
        item: pageUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(lodgingSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <PGDetailClient pg={pg} />
    </>
  );
}
