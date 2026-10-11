import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PGDetailClient from "./PGDetailClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Next.js 15: params is a Promise
interface Props {
  params: Promise<{ id: string }>;
}

async function fetchPG(id: string) {
  try {
    const res = await fetch(`${API_URL}/api/public/pgs/${id}`, {
      next: { revalidate: 3600 },
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
    `${process.env.NEXT_PUBLIC_APP_URL || "https://pg-eg.com"}/og-default.jpg`;

  const pageUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://pg-eg.com"}/pg/${id}`;

  return {
    title: `${pg.name} | PG-EG`,
    description,
    openGraph: {
      title: pg.name,
      description,
      url: pageUrl,
      siteName: "PG-EG",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: pg.name }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: pg.name,
      description,
      images: [imageUrl],
    },
  };
}

export default async function PGDetailPage({ params }: Props) {
  const { id } = await params;
  const pg = await fetchPG(id);
  if (!pg) notFound();
  return <PGDetailClient pg={pg} />;
}
