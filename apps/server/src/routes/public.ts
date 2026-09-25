import { Router, Request, Response } from "express";
import { isNotNull } from "drizzle-orm";
import { createDb, pgs } from "../db";
import { resolveMapsLink, haversineKm } from "../utils/maps";

const router = Router();

// ─── GET /api/public/pgs/nearby ─────────────────────────────────────
// PUBLIC — no auth required.
// Query params:
//   lat  (number) — searcher's latitude
//   lng  (number) — searcher's longitude
//   radius (number, km, default 10) — search radius
// Returns PGs sorted by distance, only those with stored coordinates.
router.get("/pgs/nearby", async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseFloat((req.query.radius as string) || "10");

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: "lat and lng are required numbers" });
      return;
    }

    const db = createDb(process.env.DATABASE_URL!);

    // Fetch all PGs with coordinates
    const allPgs = await db
      .select({
        id: pgs.id,
        name: pgs.name,
        type: pgs.type,
        address: pgs.address,
        locationLink: pgs.locationLink,
        sharings: pgs.sharings,
        totalBeds: pgs.totalBeds,
        managerName: pgs.managerName,
        managerPhone: pgs.managerPhone,
        coverImageUrl: pgs.coverImageUrl,
        latitude: pgs.latitude,
        longitude: pgs.longitude,
      })
      .from(pgs)
      .where(isNotNull(pgs.latitude));

    // Calculate distances in JS with Haversine
    const results = allPgs
      .filter((pg) => pg.latitude != null && pg.longitude != null)
      .map((pg) => {
        const distKm = haversineKm(lat, lng, pg.latitude!, pg.longitude!);
        return {
          id: pg.id,
          name: pg.name,
          type: pg.type,
          address: pg.address,
          locationLink: pg.locationLink,
          sharings: (() => {
            const s = pg.sharings as unknown as string;
            try { return JSON.parse(s); } catch { /* fallback */ }
            // Space-separated fallback: "1 2 3"
            return s ? s.split(/\s+/).map(Number).filter(Boolean) : [];
          })(),
          totalBeds: pg.totalBeds,
          managerName: pg.managerName,
          managerPhone: pg.managerPhone,
          coverImageUrl: pg.coverImageUrl,
          latitude: pg.latitude,
          longitude: pg.longitude,
          distanceKm: Math.round(distKm * 10) / 10, // 1 decimal place
        };
      })
      .filter((pg) => pg.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({ results, searchedAt: { lat, lng }, radius });
  } catch (error) {
    console.error("Nearby PGs error:", error);
    res.status(500).json({ error: "Failed to fetch nearby PGs" });
  }
});

// ─── POST /api/public/resolve-link ──────────────────────────────────
// PUBLIC — no auth required.
// Body: { url: string }
// Resolves a Google Maps link (short or long) to lat/lng coordinates.
router.post("/resolve-link", async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url?.trim()) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    const coords = await resolveMapsLink(url.trim());
    if (!coords) {
      res.status(422).json({
        error: "Could not extract coordinates from this link. Please paste the full URL from your browser address bar.",
      });
      return;
    }

    res.json({ lat: coords.lat, lng: coords.lng });
  } catch (error) {
    console.error("Resolve link error:", error);
    res.status(500).json({ error: "Failed to resolve link" });
  }
});

// ─── GET /api/public/nearby-places ──────────────────────────────────
// Gets nearby landmarks for a lat/lng using multiple strategies:
//   1. Nominatim reverse geocode (fast, <1s) — gets area name + nearby places
//   2. Overpass API (slower, retries 3 mirrors)
// In-memory cache for 1 hour.

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const _placesCache = new Map<string, { data: unknown[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function overpassPlaceIcon(tags: Record<string, string>): string {
  const amenity = tags.amenity || "";
  const office  = tags.office  || "";
  const tourism = tags.tourism || "";
  const leisure = tags.leisure || "";
  if (amenity === "university" || amenity === "college") return "🎓";
  if (amenity === "school")       return "🏫";
  if (amenity === "hospital")     return "🏥";
  if (amenity === "bus_station")  return "🚌";
  if (amenity === "marketplace")  return "🛍️";
  if (office === "it" || office === "company") return "💼";
  if (tourism === "hotel" || tourism === "hostel") return "🏨";
  if (leisure === "stadium" || leisure === "sports_centre") return "🏟️";
  return "📍";
}

function haversineKmLocal(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function tryOverpass(lat: number, lng: number): Promise<unknown[] | null> {
  // 2km radius, broad place types
  const query = `
    [out:json][timeout:8];
    (
      node["amenity"~"college|university|school|hospital|bus_station|marketplace"](around:2000,${lat},${lng});
      way["amenity"~"college|university|school|hospital"](around:2000,${lat},${lng});
      node["shop"~"supermarket|mall|department_store|convenience"](around:2000,${lat},${lng});
      node["tourism"~"hotel|hostel|guest_house"](around:2000,${lat},${lng});
      node["office"~"it|company|educational_institution"](around:2000,${lat},${lng});
      node["leisure"~"stadium|sports_centre"](around:2000,${lat},${lng});
      node["name"](around:1000,${lat},${lng})["amenity"];
    );
    out center 30;
  `;
  const encoded = encodeURIComponent(query);
  for (const server of OVERPASS_SERVERS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch(`${server}?data=${encoded}`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "PG-EG/1.0" },
      });
      clearTimeout(t);
      if (r.ok) {
        const data = await r.json() as { elements?: unknown[] };
        if (data.elements?.length) return data.elements;
      }
    } catch { /* try next */ }
  }
  return null;
}

async function tryNominatim(lat: number, lng: number): Promise<unknown[] | null> {
  // Search multiple place types within ~2km viewbox
  const delta = 0.018; // ~2km
  const viewbox = `${lng-delta},${lat+delta},${lng+delta},${lat-delta}`;
  // Try a few amenity types in parallel
  const types = ["college", "school", "hospital", "bus_station", "supermarket"];
  const results: unknown[] = [];
  for (const amenity of types) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=0` +
        `&amenity=${amenity}&bounded=1&viewbox=${viewbox}`;
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "PG-EG/1.0 (pg-eg app)" },
      });
      if (!r.ok) continue;
      const data = await r.json() as Array<{ display_name: string; lat: string; lon: string; type: string; class: string }>;
      data.forEach((item) => results.push({
        type: "node",
        tags: { name: item.display_name.split(",")[0].trim(), amenity: amenity },
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      }));
    } catch { /* continue */ }
  }
  return results.length > 0 ? results : null;
}

router.get("/nearby-places", async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: "lat and lng are required" });
      return;
    }

    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = _placesCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      res.json({ places: cached.data, source: "cache" });
      return;
    }

    // Try Overpass first (best data), Nominatim as fallback
    let elements = await tryOverpass(lat, lng);
    let source = "overpass";
    if (!elements?.length) {
      elements = await tryNominatim(lat, lng);
      source = "nominatim";
    }

    if (!elements?.length) {
      res.json({ places: [], source: "empty" });
      return;
    }

    const seen = new Set<string>();
    const places = (elements as Record<string, unknown>[])
      .filter((e) => {
        const tags = (e.tags || {}) as Record<string, string>;
        return tags?.name && tags.name.trim().length > 2;
      })
      .map((e) => {
        const tags = (e.tags || {}) as Record<string, string>;
        let eLat: number | undefined;
        let eLng: number | undefined;
        if (e.type === "way") {
          eLat = (e.center as Record<string, number>)?.lat;
          eLng = (e.center as Record<string, number>)?.lon;
        } else {
          eLat = typeof e.lat === "number" ? e.lat : parseFloat(String(e.lat));
          eLng = typeof e.lon === "number" ? e.lon : parseFloat(String(e.lon));
        }
        if (!eLat || !eLng || isNaN(eLat) || isNaN(eLng)) return null;
        const name = tags.name.trim();
        const short = tags.short_name || tags["name:en"] || name;
        // Truncate at word boundary cleanly
        const shortTrunc = short.length > 36
          ? short.slice(0, 34).replace(/\s+\S*$/, "") + "…"
          : short;
        return {
          name,
          short: shortTrunc,
          lat: eLat,
          lng: eLng,
          icon: overpassPlaceIcon(tags),
          // No distanceKm — not needed in landmark picker list
        };
      })
      .filter((p): p is NonNullable<typeof p> => {
        if (!p) return false;
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return true;
      })
      // No sort needed — list order from OSM is fine for the picker
      .slice(0, 25);

    if (places.length > 0) {
      _placesCache.set(cacheKey, { data: places, ts: Date.now() });
    }
    res.json({ places, source });
  } catch (error) {
    console.error("Nearby places error:", error);
    res.status(500).json({ error: "Failed to fetch nearby places" });
  }
});

// ─── GET /api/public/geocode ─────────────────────────────────────────
// Geocodes a place name to lat/lng via Nominatim, biased to user's location.
// Query: q (place name), lat, lng (user's coords for local bias)
// Returns: { name, lat, lng }
router.get("/geocode", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || "").trim();
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (!q) {
      res.status(400).json({ error: "q is required" });
      return;
    }

    // Nominatim free-text search, biased to user's area
    const viewbox = !isNaN(lat) && !isNaN(lng)
      ? `&viewbox=${lng-0.15},${lat+0.15},${lng+0.15},${lat-0.15}&bounded=0`
      : "";
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0` +
      `&q=${encodeURIComponent(q)}${viewbox}`;

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "PG-EG/1.0 (pg-eg app)" },
    });

    if (!r.ok) { res.status(502).json({ error: "Geocoding service unavailable" }); return; }
    const data = await r.json() as Array<{ display_name: string; lat: string; lon: string }>;
    if (!data?.length) {
      res.status(404).json({ error: `Could not find "${q}" on the map. Try a more specific name.` });
      return;
    }

    res.json({
      name: data[0].display_name.split(",")[0].trim(),
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    });
  } catch (error) {
    console.error("Geocode error:", error);
    res.status(500).json({ error: "Geocoding failed" });
  }
});

export default router;
