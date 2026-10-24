"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./PGImageSlider.module.css";

interface PGImageSliderProps {
  images?: any[];
  pgName: string;
  onOpenLightbox?: (index: number) => void;
  className?: string;
  autoSlideInterval?: number;
  renderTopRight?: React.ReactNode;
}

export default function PGImageSlider({
  images = [],
  pgName,
  onOpenLightbox,
  className = "",
  autoSlideInterval = 3500,
  renderTopRight,
}: PGImageSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Normalize image urls
  const slideUrls = images
    .map((img) => (typeof img === "string" ? img : img?.url || ""))
    .filter((url) => Boolean(url));

  const total = slideUrls.length;

  const goToNext = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (total <= 1) return;
      setCurrentIndex((prev) => (prev + 1) % total);
    },
    [total]
  );

  const goToPrev = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (total <= 1) return;
      setCurrentIndex((prev) => (prev - 1 + total) % total);
    },
    [total]
  );

  // Auto sliding timer
  useEffect(() => {
    if (total <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, autoSlideInterval);

    return () => clearInterval(interval);
  }, [total, isPaused, autoSlideInterval]);

  // Touch event handlers for mobile & medium screens swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current !== null && total > 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - (touchStartY.current ?? 0);

      // Dominant horizontal swipe with threshold > 35px
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 35) {
        if (deltaX < 0) {
          goToNext();
        } else {
          goToPrev();
        }
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
    setIsPaused(false);
  };

  if (total === 0) {
    return (
      <div className={`${styles.sliderContainer} ${className}`}>
        <div className={styles.noImage}>No Image Available</div>
        {renderTopRight && <div className={styles.topActionsSlot}>{renderTopRight}</div>}
      </div>
    );
  }

  return (
    <div
      className={`${styles.sliderContainer} ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => onOpenLightbox?.(currentIndex)}
      role="region"
      aria-label={`Photo slider for ${pgName}`}
    >
      {/* Sliding Track */}
      <div
        className={styles.track}
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {slideUrls.map((url, i) => (
          <div key={i} className={styles.slide}>
            <img
              src={url}
              alt={`${pgName} photo ${i + 1}`}
              className={styles.image}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ))}
      </div>

      {/* Top Right Slot for mobile Save / Share actions */}
      {renderTopRight && (
        <div
          className={styles.topActionsSlot}
          onClick={(e) => e.stopPropagation()}
        >
          {renderTopRight}
        </div>
      )}

      {/* Small chevrons on both ends for desktop / big screens */}
      {total > 1 && (
        <>
          <button
            type="button"
            className={`${styles.chevronBtn} ${styles.chevronLeft}`}
            onClick={goToPrev}
            aria-label="Previous photo"
            title="Previous photo"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button
            type="button"
            className={`${styles.chevronBtn} ${styles.chevronRight}`}
            onClick={goToNext}
            aria-label="Next photo"
            title="Next photo"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* Bottom Indicators: Dots & (2/3) Badge */}
      {total > 1 && (
        <div className={styles.bottomBar}>
          {/* Dots Indicator */}
          <div
            className={styles.dotsWrapper}
            onClick={(e) => e.stopPropagation()}
          >
            {slideUrls.slice(0, 8).map((_, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.dot} ${i === currentIndex ? styles.dotActive : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(i);
                }}
                aria-label={`Go to photo ${i + 1}`}
              />
            ))}
          </div>

          {/* Counter Badge (e.g. 2 / 6) */}
          <div className={styles.counterBadge}>
            {currentIndex + 1} / {total}
          </div>
        </div>
      )}
    </div>
  );
}
