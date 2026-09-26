"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface AppLogoProps {
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  href?: string;
}

// Width-based sizes — height is auto via CSS (image is ~4:1 wide)
const WIDTHS = {
  sm: 110,
  md: 160,
  lg: 260,
};

export default function AppLogo({ size = "md", onClick, href }: AppLogoProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, role, hasPG } = useAuth();

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
      title={role === "user" ? "Find PG" : isAuthenticated ? "Go to Dashboard" : "Go to Home"}
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
