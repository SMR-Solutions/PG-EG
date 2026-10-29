import { MetadataRoute } from "next";
import { BANGALORE_LOCATIONS } from "@/data/bangaloreLocations";
import { APP_URL, API_URL } from "@/lib/siteConfig";

interface PublicPGSummary {
  id: string;
  updatedAt?: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentDate = new Date();

  // 1. Core static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: APP_URL,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${APP_URL}/bangalore`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${APP_URL}/find-pg`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${APP_URL}/terms`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${APP_URL}/privacy`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  // 2. Bangalore Programmatic Locality / Landmark routes
  const bangaloreRoutes: MetadataRoute.Sitemap = BANGALORE_LOCATIONS.map((loc) => ({
    url: `${APP_URL}/bangalore/${loc.slug}`,
    lastModified: currentDate,
    changeFrequency: "weekly",
    priority: 0.85,
  }));

  // 3. Dynamic active PG individual pages (/pg/[id])
  let pgRoutes: MetadataRoute.Sitemap = [];
  try {
    // Bangalore center coordinates to fetch nearby active PGs for sitemap
    const res = await fetch(`${API_URL}/api/public/pgs/nearby?lat=12.9716&lng=77.5946&radius=60`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const pgs: PublicPGSummary[] = data.results || [];
      pgRoutes = pgs.map((pg) => ({
        url: `${APP_URL}/pg/${pg.id}`,
        lastModified: pg.updatedAt ? new Date(pg.updatedAt) : currentDate,
        changeFrequency: "daily",
        priority: 0.8,
      }));
    }
  } catch (err) {
    console.warn("Sitemap: Could not fetch active PGs from backend:", err);
  }

  return [...staticRoutes, ...bangaloreRoutes, ...pgRoutes];
}

