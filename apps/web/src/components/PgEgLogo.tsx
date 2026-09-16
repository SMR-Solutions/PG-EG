"use client";
import { useRouter } from "next/navigation";

interface PgEgLogoProps {
  size?: "sm" | "md";
}

export default function PgEgLogo({ size = "md" }: PgEgLogoProps) {
  const router = useRouter();
  const fontSize = size === "sm" ? 15 : 18;
  return (
    <button
      onClick={() => router.push("/dashboard")}
      id="btn-pg-eg-logo"
      title="Go to Dashboard"
      style={{
        background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 0", flexShrink: 0,
      }}
    >
      <span style={{
        fontSize, fontWeight: 900, letterSpacing: "-0.5px",
        background: "linear-gradient(90deg, #2dc653, #4facfe)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        filter: "drop-shadow(0 0 8px rgba(45,198,83,0.3))",
        fontFamily: "inherit",
      }}>PG</span>
      <span style={{
        fontSize: fontSize - 2, fontWeight: 900,
        color: "rgba(255,255,255,0.25)",
        fontFamily: "inherit",
      }}>—</span>
      <span style={{
        fontSize, fontWeight: 900, letterSpacing: "-0.5px",
        background: "linear-gradient(90deg, #4facfe, #a78bfa)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        fontFamily: "inherit",
      }}>EG</span>
    </button>
  );
}
