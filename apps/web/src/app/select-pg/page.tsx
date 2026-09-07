"use client";
import AppLogo from "@/components/AppLogo";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

export default function SelectPGPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, owner, allPgs, activePgId, setActivePg } = useAuth();

  // Guard: must be logged in
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/sign-in");
  }, [isLoading, isAuthenticated, router]);

  // If only one PG → go straight to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && allPgs.length === 1) {
      setActivePg(allPgs[0].id);
      router.replace("/dashboard");
    }
    if (!isLoading && isAuthenticated && allPgs.length === 0) {
      router.replace("/add-pg");
    }
  }, [isLoading, isAuthenticated, allPgs, setActivePg, router]);

  if (isLoading || !isAuthenticated || allPgs.length <= 1) return null;

  function handleSelect(pgId: string) {
    setActivePg(pgId);
    router.push("/dashboard");
  }

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.content}>
        {/* Header */}
        <div className={`${styles.header} animate-fade-up`}>
          <AppLogo />
        </div>

        {/* Title */}
        <div className={`${styles.titleBlock} animate-fade-up delay-1`}>
          <p className={styles.welcome}>Welcome back, {owner?.name?.split(" ")[0]} 👋</p>
          <h2 className={styles.title}>Select a Property</h2>
          <p className={styles.subtitle}>
            You manage {allPgs.length} properties. Which one would you like to open?
          </p>
        </div>

        {/* PG Cards */}
        <div className={`${styles.pgList} animate-fade-up delay-2`}>
          {allPgs.map((pg, idx) => {
            const isActive = pg.id === activePgId;
            return (
              <button
                key={pg.id}
                className={`${styles.pgCard} ${isActive ? styles.pgCardActive : ""}`}
                onClick={() => handleSelect(pg.id)}
                id={`btn-select-pg-${pg.id}`}
              >
                <div className={styles.pgIndex}>{idx + 1}</div>
                <div className={styles.pgInfo}>
                  <span className={styles.pgName}>{pg.name}</span>
                  {isActive && (
                    <span className={styles.pgLastBadge}>Last viewed</span>
                  )}
                </div>
                <span className={styles.pgArrow}>→</span>
              </button>
            );
          })}
        </div>

        <p className={`${styles.note} animate-fade-up delay-3`}>
          You can switch between properties anytime from the profile icon on the dashboard.
        </p>
      </div>
    </main>
  );
}
