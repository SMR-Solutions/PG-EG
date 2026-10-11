"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./offline.module.css";
import AppLogo from "@/components/AppLogo";

export default function OfflinePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Automatically redirect back when online event triggers
  useEffect(() => {
    const handleOnline = () => {
      router.push("/");
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [router]);

  const handleRetry = async () => {
    setChecking(true);
    setStatusMsg(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setTimeout(() => {
        setChecking(false);
        setStatusMsg("Still offline. Please check your internet connection.");
      }, 600);
      return;
    }

    try {
      const probeUrl = `${window.location.origin}/favicon.ico?_probe=${Date.now()}`;
      await fetch(probeUrl, { method: "HEAD", cache: "no-store" });
      router.push("/");
    } catch {
      setChecking(false);
      setStatusMsg("Unable to connect. Please check your Wi-Fi or mobile data.");
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.card}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
          <AppLogo />
        </div>

        <div className={styles.iconWrap}>
          <svg
            className={styles.wifiIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
          </svg>
        </div>

        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          You're Offline
        </div>

        <h1 className={styles.title}>No Internet Connection</h1>
        <p className={styles.desc}>
          It seems you have lost your connection to the internet. Please connect to Wi-Fi or mobile data to continue using PG-EG.
        </p>

        <div className={styles.tipsBox}>
          <div className={styles.tipsTitle}>💡 How to reconnect:</div>
          <ul className={styles.tipsList}>
            <li>📶 Check your Wi-Fi router or mobile data</li>
            <li>✈️ Verify Airplane Mode is turned off</li>
            <li>🔄 Re-enable connection and tap Retry</li>
          </ul>
        </div>

        <button
          className={styles.retryBtn}
          onClick={handleRetry}
          disabled={checking}
          id="btn-offline-retry"
        >
          {checking ? (
            <>
              <span className={styles.spinner} />
              Reconnecting…
            </>
          ) : (
            <>
              <span>🔄</span> Try Again
            </>
          )}
        </button>

        {statusMsg && <div className={styles.errorMsg}>{statusMsg}</div>}
      </div>
    </main>
  );
}
