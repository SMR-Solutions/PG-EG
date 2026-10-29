"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../bangalore.module.css";

export interface PublicPG {
  id: string;
  name: string;
  type: string;
  address: string;
  locationLink?: string | null;
  sharings: number[];
  distanceKm: number;
  managerPhone?: string | null;
  baseRent?: number | null;
  coverImageUrl?: string | null;
  pgImages?: Array<{ url: string } | string>;
}

interface Props {
  pgs: PublicPG[];
  locationName: string;
}

export default function LocalityListingClient({ pgs, locationName }: Props) {
  const [filterType, setFilterType] = useState<"all" | "gents" | "ladies" | "co-living">("all");

  const filteredPgs = pgs.filter((pg) => {
    if (filterType === "all") return true;
    return pg.type === filterType;
  });

  const getSharingText = (sharings: number[]) => {
    if (!sharings || sharings.length === 0) return "1, 2, 3 Sharing";
    return sharings.map((s) => `${s}-Sharing`).join(" · ");
  };

  const getImageUrl = (pg: PublicPG) => {
    if (pg.coverImageUrl) return pg.coverImageUrl;
    if (pg.pgImages && pg.pgImages.length > 0) {
      const first = pg.pgImages[0];
      return typeof first === "string" ? first : first.url;
    }
    return null;
  };

  return (
    <>
      {/* ─── Filter Bar ─── */}
      <div className={styles.filterBar}>
        <div className={styles.filterCounts}>
          Showing <strong>{filteredPgs.length}</strong> {filteredPgs.length === 1 ? "PG" : "PGs"} near {locationName}
        </div>
        <div className={styles.filterTabs}>
          {(["all", "gents", "ladies", "co-living"] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={`${styles.filterBtn} ${filterType === type ? styles.filterBtnActive : ""}`}
              onClick={() => setFilterType(type)}
            >
              {type === "all" ? "All PGs" : type === "co-living" ? "Co-Living" : `${type.charAt(0).toUpperCase() + type.slice(1)} PG`}
            </button>
          ))}
        </div>
      </div>

      {/* ─── PG Cards Grid ─── */}
      {filteredPgs.length > 0 ? (
        <div className={styles.pgGrid}>
          {filteredPgs.map((pg) => {
            const img = getImageUrl(pg);
            const typeLabel =
              pg.type === "ladies" ? "Ladies PG 👩" :
              pg.type === "gents"  ? "Gents PG 👨" :
              "Co-Living 🤝";

            return (
              <article key={pg.id} className={styles.pgCard}>
                <div className={styles.imageWrap}>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={`${pg.name} in ${locationName}`} className={styles.cardImg} loading="lazy" />
                  ) : (
                    <div className={styles.imagePlaceholder}>
                      <span>🏠</span>
                      <span>Verified PG-EG Property</span>
                    </div>
                  )}
                  <div className={styles.cardBadges}>
                    <span className={styles.typeBadge}>{typeLabel}</span>
                    <span className={styles.distanceBadge}>📍 {pg.distanceKm} km away</span>
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <h2 className={styles.cardTitle}>{pg.name}</h2>
                  <p className={styles.cardAddress}>{pg.address}</p>

                  <div className={styles.sharingsWrap}>
                    <span className={styles.sharingPill}>{getSharingText(pg.sharings)}</span>
                    <span className={styles.sharingPill}>⚡ Zero Brokerage</span>
                  </div>

                  <div className={styles.cardFooter}>
                    <div className={styles.priceWrap}>
                      <span className={styles.priceLabel}>Monthly Rent</span>
                      <span className={styles.priceAmount}>
                        {pg.baseRent ? `₹${pg.baseRent.toLocaleString("en-IN")}` : "Rent on Call"}
                      </span>
                    </div>

                    <div className={styles.cardActions}>
                      {pg.managerPhone && (
                        <a
                          href={`tel:${pg.managerPhone}`}
                          className={styles.callBtn}
                          aria-label={`Call manager of ${pg.name}`}
                        >
                          📞 Call
                        </a>
                      )}
                      <Link href={`/pg/${pg.id}`} className={styles.viewBtn}>
                        View Rooms →
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>Looking for newly registered PGs in {locationName}?</div>
          <p className={styles.emptyStateSub}>
            New properties are onboarded weekly across Bangalore. Try expanding your search or use GPS to find accommodations around your current spot.
          </p>
          <Link href="/find-pg" className={styles.ctaDetectBtn}>
            📍 Explore All Nearby Bangalore PGs
          </Link>
        </div>
      )}
    </>
  );
}

