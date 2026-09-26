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
 * Follows up to 5 redirect hops — maps.app.goo.gl typically takes 2-3 hops
 * before reaching a full URL containing coordinates.
 */
export async function resolveMapsLink(url: string): Promise<{ lat: number; lng: number } | null> {
  if (!url || !url.trim()) return null;
  let current = url.trim();

  // First try to extract directly (already a full URL)
  const direct = extractCoordsFromUrl(current);
  if (direct) return direct;

  // Follow redirect chain (up to 5 hops)
  for (let hop = 0; hop < 5; hop++) {
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",           // Don't auto-follow — we do it manually
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,*/*",
        },
      });

      // Try coords in the current URL before checking redirect
      const fromCurrent = extractCoordsFromUrl(current);
      if (fromCurrent) return fromCurrent;

      // 3xx → follow Location header
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;

        // Resolve relative Location headers
        try {
          current = new URL(location, current).href;
        } catch {
          current = location;
        }

        // Try extracting from this new URL immediately
        const fromRedirect = extractCoordsFromUrl(current);
        if (fromRedirect) return fromRedirect;
        continue; // follow next hop
      }

      // 200 response — try body text as last resort
      const body = await res.text().catch(() => "");
      const fromBody = extractCoordsFromUrl(body);
      if (fromBody) return fromBody;

      break; // Non-redirect 200 but no coords found
    } catch {
      break; // Network error or timeout
    }
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
