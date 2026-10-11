"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./OfflineDetector.module.css";

export default function OfflineDetector() {
  const [isOffline, setIsOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showOnlineToast, setShowOnlineToast] = useState(false);

  // Connection status listeners
  useEffect(() => {
    // Initial check on mount
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
    }

    const handleOffline = () => {
      setIsOffline(true);
      setShowOnlineToast(false);
      setFeedback(null);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setFeedback(null);
      setShowOnlineToast(true);
      const timer = setTimeout(() => setShowOnlineToast(false), 3500);
      return () => clearTimeout(timer);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // Actively test connection
  const checkConnection = useCallback(async () => {
    setChecking(true);
    setFeedback(null);

    // If browser already flags navigator.onLine as false, still offline
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setTimeout(() => {
        setChecking(false);
        setFeedback("Still offline. Please connect to Wi-Fi or mobile data.");
      }, 700);
      return;
    }

    try {
      // Perform a lightweight probe with cache busting and a short 3s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const probeUrl = `${window.location.origin}/favicon.ico?_probe=${Date.now()}`;
      await fetch(probeUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Reconnected!
      setIsOffline(false);
      setChecking(false);
      setFeedback(null);
      setShowOnlineToast(true);
      setTimeout(() => setShowOnlineToast(false), 3500);
    } catch {
      setChecking(false);
      setFeedback("Unable to reach internet. Please check your network and try again.");
    }
  }, []);

  return (
    <>
      {/* ── Offline Fullscreen Modal ── */}
      {isOffline && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.card}>
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
              No Connection
            </div>

            <h2 className={styles.title}>No Internet Connection</h2>
            <p className={styles.desc}>
              You appear to be offline. Please connect to Wi-Fi or mobile data to continue using PG-EG.
            </p>

            <div className={styles.tipsBox}>
              <div className={styles.tipsTitle}>
                <span>💡</span> Quick tips to reconnect:
              </div>
              <ul className={styles.tipsList}>
                <li>📶 Check your Wi-Fi or cellular data switch</li>
                <li>✈️ Ensure Airplane Mode is turned off</li>
                <li>🔄 Reconnect to your network or hotspot</li>
              </ul>
            </div>

            <div className={styles.btnGroup}>
              <button
                className={styles.retryBtn}
                onClick={checkConnection}
                disabled={checking}
                id="btn-retry-connection"
              >
                {checking ? (
                  <>
                    <span className={styles.spinner} />
                    Checking Connection…
                  </>
                ) : (
                  <>
                    <span>🔄</span> Try Again
                  </>
                )}
              </button>
            </div>

            {feedback && <div className={styles.feedbackMsg}>{feedback}</div>}
          </div>
        </div>
      )}

      {/* ── Reconnected Toast Banner ── */}
      {showOnlineToast && (
        <div className={styles.onlineToast}>
          <span>🟢</span> Back Online! Connection restored.
        </div>
      )}
    </>
  );
}
