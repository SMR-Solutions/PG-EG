"use client";

import { useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface AppLogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  onClick?: () => void;
  href?: string;
}

// Width-based sizes — height is auto via CSS (image is ~4:1 wide)
const WIDTHS = {
  xs: 100,
  sm: 140,
  md: 180,
  lg: 260,
};

/**
 * Returns false on the server and during the hydration pass (React calls
 * getServerSnapshot), then true after hydration (React calls getSnapshot).
 * Unlike useState+useEffect, React 18 understands this transition and does
 * NOT emit a hydration mismatch warning when server and client snapshots differ.
 */
function useIsHydrated() {
  return useSyncExternalStore(
    () => () => {},  // subscribe: no external store — no-op unsubscribe
    () => true,      // getSnapshot:       client post-hydration  → hydrated
    () => false      // getServerSnapshot: server / hydration pass → not hydrated
  );
}

export default function AppLogo({ size = "md", onClick, href }: AppLogoProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, role, hasPG } = useAuth();

  // During the hydration pass React uses getServerSnapshot() → false → "PG-EG"
  // (matches server HTML). After hydration it switches to getSnapshot() → true
  // and the title updates to the auth-appropriate value without a warning.
  const hydrated = useIsHydrated();

  const title = !hydrated
    ? "PG-EG"
    : role === "user"
    ? "Find PG"
    : isAuthenticated
    ? "Go to Dashboard"
    : "Go to Home";

  function handleClick() {
    if (onClick) {
      onClick();
      return;
    }
    if (href) {
      router.push(href);
      return;
    }

    if (!isAuthenticated) {
      if (pathname !== "/") router.push("/");
      return;
    }

    // Role-based navigation for authenticated users
    if (role === "user") {
      // Seekers/students stay on or go to find-pg
      if (pathname !== "/find-pg") {
        router.push("/find-pg");
      }
      return;
    }

    // Owner navigation
    if (hasPG) {
      if (pathname !== "/dashboard") {
        router.push("/dashboard");
      }
    } else {
      if (pathname !== "/add-pg") {
        router.push("/add-pg");
      }
    }
  }

  const w = WIDTHS[size];

  return (
    <button
      type="button"
      onClick={handleClick}
      id="app-logo-btn"
      title={title}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      {/* Use a native <img> so height auto-scales with natural aspect ratio */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/pg-eg-logo-wide.png"
        alt="PG-EG Logo"
        width={w}
        style={{
          height: "auto",
          display: "block",
          borderRadius: 10,
        }}
      />
    </button>
  );
}
