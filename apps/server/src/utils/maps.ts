/**
 * Utility: Extract lat/lng coordinates from any Google Maps URL.
 * Supports:
 *  - Full browser URLs: .../@lat,lng,15z... or ...!3d{lat}!4d{lng}...
 *  - Short links: maps.app.goo.gl/... (expanded via HTTP redirect)
 */

/**
 * Extract coordinates from a full Google Maps URL (no network call).
 */
export function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null;

  // Pattern 1: !3d{lat}!4d{lng}  (most reliable — place data)
  const p1 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (p1) return { lat: parseFloat(p1[1]), lng: parseFloat(p1[2]) };

  // Pattern 2: @{lat},{lng},{zoom}z
  const p2 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (p2) return { lat: parseFloat(p2[1]), lng: parseFloat(p2[2]) };

  // Pattern 3: ?q={lat},{lng}
  const p3 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (p3) return { lat: parseFloat(p3[1]), lng: parseFloat(p3[2]) };

  return null;
}

/**
 * Resolve any Google Maps link (short or long) and return coordinates.
 * For short links (maps.app.goo.gl/...) we follow the redirect header.
 * Returns null if coordinates cannot be extracted.
 */
export async function resolveMapsLink(url: string): Promise<{ lat: number; lng: number } | null> {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();

  // First try to extract directly (full URL case)
  const direct = extractCoordsFromUrl(trimmed);
  if (direct) return direct;

  // If short link or no coords found → follow redirect
  try {
    const res = await fetch(trimmed, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    // 301/302/307/308 → Location header contains the expanded URL
    const expanded = res.headers.get("location");
    if (expanded) {
      const fromExpanded = extractCoordsFromUrl(expanded);
      if (fromExpanded) return fromExpanded;
    }

    // Some short links do a chain of redirects; try the body text as fallback
    const body = await res.text().catch(() => "");
    const fromBody = extractCoordsFromUrl(body);
    if (fromBody) return fromBody;
  } catch {
    // Network error or timeout — silently return null
  }

  return null;
}

/**
 * Haversine formula — straight-line distance between two lat/lng points in km.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
