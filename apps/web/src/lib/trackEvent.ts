/**
 * Shared PG event tracking utility — Chunk 2/3 (Leads).
 * Import this in any client component that needs to fire tracking events.
 *
 * Rules:
 *  - Fire-and-forget: never throws, never blocks the UI.
 *  - No PII: only pgId + eventType + anonymous visitor ID.
 *  - Visitor ID is a random UUID stored in localStorage (first-party, no cross-site tracking).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Returns a stable, random first-party visitor ID from localStorage. */
export function getVisitorId(): string {
  const KEY = "pg_eg_visitor_id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/**
 * Fire-and-forget POST to /api/events.
 * Uses fetch with keepalive so the request survives page navigations.
 * Swallows all errors — tracking failures must never affect the user experience.
 */
export function trackEvent(eventType: string, pgId: string): void {
  try {
    const visitorId = getVisitorId();
    fetch(`${API_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pgId, eventType, visitorId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* noop */
  }
}
