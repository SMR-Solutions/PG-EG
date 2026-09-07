"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface AppLogoProps {
  size?: "sm" | "md" | "lg";
}

// Width-based sizes — height is auto via CSS (image is ~4:1 wide)
const WIDTHS = {
  sm: 110,
  md: 160,
  lg: 260,
};

export default function AppLogo({ size = "md" }: AppLogoProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  function handleClick() {
    if (isAuthenticated) {
      router.push("/dashboard");
    } else {
      router.push("/");
    }
  }

  const w = WIDTHS[size];

  return (
    <button
      onClick={handleClick}
      id="app-logo-btn"
      title={isAuthenticated ? "Go to Dashboard" : "Go to Home"}
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
