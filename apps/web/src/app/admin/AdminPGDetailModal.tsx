"use client";

import { useEffect, useState } from "react";
import styles from "./admin.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface AdminPGDetailModalProps {
  pgId: string;
  adminKey?: string;
  token?: string | null;
  onClose: () => void;
  onStatusChange: (pgId: string, newStatus: boolean) => void;
}

export default function AdminPGDetailModal({
  pgId,
  adminKey,
  token,
  onClose,
  onStatusChange,
}: AdminPGDetailModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState(false);

  const getHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    if (adminKey) h["x-admin-key"] = adminKey;
    return h;
  };

  useEffect(() => {
    async function fetchDetail() {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/admin/pgs/${pgId}`, {
          headers: getHeaders(),
        });
        if (!res.ok) throw new Error("Failed to load PG details");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "Failed to load details");
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [pgId, adminKey, token]);

  async function handleToggleStatus() {
    if (!data?.pg || toggling) return;
    const nextStatus = !data.pg.isActive;
    setToggling(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/pgs/${pgId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getHeaders(),
        },
        body: JSON.stringify({ isActive: nextStatus }),
      });
      if (!res.ok) throw new Error("Status update failed");
      setData((prev: any) => ({
        ...prev,
        pg: { ...prev.pg, isActive: nextStatus },
      }));
      onStatusChange(pgId, nextStatus);
    } catch (err) {
      alert("Failed to toggle status");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{data?.pg?.name || "PG Details"}</h2>
            <span style={{ fontSize: 12, color: "#64748b" }}>ID: {pgId}</span>
          </div>
          <button className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.modalBody}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Loading details…</div>}
          {error && <div style={{ color: "#ef4444", textAlign: "center", padding: 20 }}>{error}</div>}

          {data && !loading && (
            <>
              {/* Activation Status Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  borderRadius: 12,
                  background: data.pg.isActive ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  border: `1px solid ${data.pg.isActive ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    className={styles.statusDot}
                    style={{ background: data.pg.isActive ? "#22c55e" : "#ef4444" }}
                  />
                  <div>
                    <strong style={{ color: data.pg.isActive ? "#4ade80" : "#f87171" }}>
                      {data.pg.isActive ? "Active Listing (Visible to Public)" : "Inactive Listing (Hidden from Search)"}
                    </strong>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {data.pg.isActive ? "Currently appears in search on /find-pg" : "Hidden from /find-pg. Direct link shows inactive status."}
                    </div>
                  </div>
                </div>

                <div className={styles.statusControlBox}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {data.pg.isActive ? "Active" : "Inactive"}
                  </span>
                  <label className={styles.toggleSwitch}>
                    <input
                      type="checkbox"
                      checked={data.pg.isActive}
                      onChange={handleToggleStatus}
                      disabled={toggling}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 10,
                  background: "rgba(0,0,0,0.25)",
                  padding: 14,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div>
                  <span className={styles.detailLabel}>Type</span>
                  <div className={styles.detailValue} style={{ textTransform: "capitalize" }}>{data.pg.type}</div>
                </div>
                <div>
                  <span className={styles.detailLabel}>Base Rent</span>
                  <div className={styles.detailValue}>₹{data.pg.baseRent?.toLocaleString("en-IN") || "N/A"}</div>
                </div>
                <div>
                  <span className={styles.detailLabel}>Floors</span>
                  <div className={styles.detailValue}>{data.pg.totalFloors}</div>
                </div>
                <div>
                  <span className={styles.detailLabel}>Rooms</span>
                  <div className={styles.detailValue}>{data.stats?.roomsCount || 0}</div>
                </div>
                <div>
                  <span className={styles.detailLabel}>Total Beds</span>
                  <div className={styles.detailValue}>{data.stats?.bedsCount || data.pg.totalBeds || 0}</div>
                </div>
                <div>
                  <span className={styles.detailLabel}>Occupied Beds</span>
                  <div className={styles.detailValue} style={{ color: "#22c55e" }}>
                    {data.stats?.occupiedBedsCount || 0} / {data.stats?.bedsCount || 0}
                  </div>
                </div>
              </div>

              {/* Location & Contacts */}
              <div className={styles.detailsGrid}>
                <div className={styles.detailCol}>
                  <span className={styles.detailLabel}>Address</span>
                  <span className={styles.detailValue}>
                    {data.pg.address || "No address entered"}
                  </span>
                  {data.pg.locationLink && (
                    <a
                      href={data.pg.locationLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.detailLink}
                      style={{ marginTop: 4 }}
                    >
                      📍 Open in Google Maps ↗
                    </a>
                  )}
                </div>

                <div className={styles.detailCol}>
                  <span className={styles.detailLabel}>Manager Contact</span>
                  <span className={styles.detailValue}>
                    {data.pg.managerName || "Not assigned"}
                  </span>
                  {data.pg.managerPhone && (
                    <a href={`tel:${data.pg.managerPhone}`} className={styles.detailLink}>
                      📞 {data.pg.managerPhone}
                    </a>
                  )}
                </div>

                <div className={styles.detailCol}>
                  <span className={styles.detailLabel}>Registered Owner</span>
                  <span className={styles.detailValue}>
                    {data.owner?.name || "Unknown"}
                  </span>
                  {data.owner?.phone && (
                    <a href={`tel:${data.owner.phone}`} className={styles.detailLink}>
                      📞 {data.owner.phone}
                    </a>
                  )}
                  {data.owner?.email && (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{data.owner.email}</span>
                  )}
                </div>
              </div>

              {/* Rooms & Beds Structure */}
              <div>
                <h3 className={styles.modalSectionTitle}>Rooms & Floors Breakdown ({data.rooms?.length || 0} Rooms)</h3>
                {data.rooms && data.rooms.length > 0 ? (
                  <div className={styles.roomsGrid}>
                    {data.rooms.map((room: any) => (
                      <div key={room.id} className={styles.roomCard}>
                        <div className={roomHeader}>
                          <span>Room {room.roomNumber}</span>
                          <span style={{ fontSize: 11, color: "#60a5fa" }}>Floor {room.floor}</span>
                        </div>
                        <div className={styles.roomSub}>
                          {room.sharingType}-Sharing • ₹{room.rentAmount?.toLocaleString("en-IN") || 0}/mo
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                          {room.beds?.map((b: any) => (
                            <span
                              key={b.id}
                              style={{
                                fontSize: 10,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: b.isOccupied ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)",
                                color: b.isOccupied ? "#fca5a5" : "#86efac",
                                fontWeight: 700,
                              }}
                            >
                              Bed {b.bedNumber} {b.isOccupied ? "(Occupied)" : "(Free)"}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#94a3b8", padding: "12px 0" }}>No rooms configured yet.</div>
                )}
              </div>

              {/* Photos Gallery Preview */}
              <div>
                <h3 className={styles.modalSectionTitle}>
                  Photos Gallery ({data.pg.pgImages?.length || 0} Photos)
                </h3>
                {data.pg.pgImages && data.pg.pgImages.length > 0 ? (
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
                    {data.pg.pgImages.map((img: any, idx: number) => {
                      const url = typeof img === "string" ? img : img?.url;
                      if (!url) return null;
                      return (
                        <img
                          key={idx}
                          src={url}
                          alt={`PG Photo ${idx + 1}`}
                          style={{
                            width: 120,
                            height: 90,
                            objectFit: "cover",
                            borderRadius: 8,
                            border: "1px solid rgba(255,255,255,0.1)",
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>No photos uploaded for this PG.</div>
                )}
              </div>

              {/* Direct Link to Public Site */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
                <a
                  href={`/pg/${pgId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.btnViewPublic}
                >
                  🌐 Open Public Listing Site ↗
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const roomHeader = styles.roomHeader;
