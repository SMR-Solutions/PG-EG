"use client";
/**
 * /find-pg route.
 * Uses dynamic({ ssr: false }) so FindPGPageClient renders ONLY on the client.
 * This lets the component read sessionStorage synchronously in useState lazy
 * initializers — no hydration mismatch, no useEffect timing race.
 */
import dynamic from "next/dynamic";

const FindPGPageClient = dynamic(() => import("./FindPGPageClient"), {
  ssr: false,
  loading: () => null,
});

export default function FindPGPage() {
  return <FindPGPageClient />;
}
