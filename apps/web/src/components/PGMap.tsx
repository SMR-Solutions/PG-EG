"use client";

import { useEffect, useRef } from "react";

interface PGResult {
  id: string;
  name: string;
  type: string;
  address: string;
  distanceKm: number;
  latitude: number | null;
  longitude: number | null;
  managerPhone: string | null;
  locationLink: string | null;
}

interface PGMapProps {
  pgs: PGResult[];
  userCoords: { lat: number; lng: number } | null;
  searchCoords: { lat: number; lng: number } | null;
  user?: { name: string; phone: string; email: string | null } | null;
  onPGSelect?: (pg: PGResult) => void;
  theme?: string;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";

function typeLabel(type: string) {
  if (type === "gents") return "🚹 Gents PG";
  if (type === "ladies") return "🚺 Ladies PG";
  return "🧑‍🤝‍🧑 Co-Living";
}

function distanceLabel(km: number) {
  if (km < 0.1) return "< 100m away";
  if (km < 1) return `${Math.round(km * 1000)}m away`;
  return `${km.toFixed(1)} km away`;
}

export default function PGMap({
  pgs,
  userCoords,
  searchCoords,
  user,
  onPGSelect,
  theme = "dark",
}: PGMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Always use the dark map style as requested
  const mapStyle = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

  const center =
    userCoords ||
    searchCoords ||
    (pgs[0]?.latitude && pgs[0]?.longitude
      ? { lat: pgs[0].latitude, lng: pgs[0].longitude }
      : { lat: 12.9716, lng: 77.5946 });

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let map: import("maplibre-gl").Map;
    let activePopup: import("maplibre-gl").Popup | null = null;
    let activePgId: string | null = null; // tracks which dot's popup is open

    async function initMap() {
      const ml = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");

      // Point MapLibre to the worker file we copied into /public
      ml.setWorkerUrl("/maplibre-worker.mjs");

      map = new ml.Map({
        container: mapContainerRef.current!,
        style: mapStyle,
        center: [center.lng, center.lat],
        zoom: 14,
        attributionControl: false,
        maxZoom: 18,
        minZoom: 10,
      });

      map.addControl(
        new ml.AttributionControl({ compact: true }),
        "bottom-right"
      );

      map.on("load", () => {
        // ── Style popup close button red ──────────────────────────────
        const styleEl = document.createElement("style");
        styleEl.textContent = `
          .maplibregl-popup-close-button {
            font-size: 18px !important; font-weight: 900 !important;
            color: #e63946 !important; padding: 2px 8px !important;
            line-height: 1 !important;
          }
          .maplibregl-popup-close-button:hover {
            background: rgba(230,57,70,0.12) !important;
          }
        `;
        map.getContainer().appendChild(styleEl);

        // ── Silence sprite image-not-found warnings ───────────────────
        map.on("styleimagemissing", (e) => {
          map.addImage(e.id, {
            width: 0,
            height: 0,
            data: new Uint8Array(0),
          } as unknown as ImageData);
        });

        // ── 1. BLUE DOT — DOM marker (user / search origin) ───────────
        // DOM marker is fine for a SINGLE point with a profile popup.
        const origin = userCoords || searchCoords;
        if (origin) {
          const dot = document.createElement("div");
          Object.assign(dot.style, {
            width: "16px",
            height: "16px",
            background: "#3b82f6",
            border: "3px solid #fff",
            borderRadius: "50%",
            boxShadow: "0 0 0 4px rgba(59,130,246,0.30), 0 2px 8px rgba(0,0,0,0.4)",
            cursor: user ? "pointer" : "default",
          });

          // Stop mousedown in CAPTURE phase so map drag never fires
          dot.addEventListener("mousedown", (e) => e.stopPropagation(), true);
          dot.addEventListener(
            "touchstart",
            (e) => e.stopPropagation(),
            { capture: true, passive: true }
          );

          const blueMarker = new ml.Marker({ element: dot, anchor: "center" })
            .setLngLat([origin.lng, origin.lat]);

          if (user) {
            const initial = user.name?.charAt(0)?.toUpperCase() ?? "U";
            const profilePopup = new ml.Popup({
              offset: [0, -10],
              maxWidth: "240px",
              closeButton: true,
              closeOnClick: false,
              focusAfterOpen: false,
              anchor: "bottom",
            }).setHTML(`
              <div style="font-family:Inter,sans-serif;min-width:190px;padding:4px 0">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                  <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#2dc653,#16a34a);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;flex-shrink:0">${initial}</div>
                  <div>
                    <div style="font-weight:800;font-size:14px;color:#111;line-height:1.2">${user.name}</div>
                    <div style="font-size:11px;color:#16a34a;font-weight:600">📍 Your Location</div>
                  </div>
                </div>
                ${user.email ? `<div style="font-size:12px;color:#555;margin-bottom:5px">✉️ ${user.email}</div>` : ""}
                ${user.phone ? `<div style="font-size:12px;color:#555">📞 ${user.phone}</div>` : ""}
              </div>
            `);

            blueMarker.setPopup(profilePopup);
            dot.addEventListener("click", (e) => {
              e.stopPropagation();
              blueMarker.togglePopup();
            });
          }

          blueMarker.addTo(map);
        }

        // ── 2. GREEN DOTS — WebGL circle layer (NO DOM, NEVER runs away) ──
        // GeoJSON source + MapLibre circle layer. Clicks handled by map.on('click').
        // The circles are drawn by the GPU — they have zero DOM element issues.
        const features = pgs
          .filter((pg) => pg.latitude && pg.longitude)
          .map((pg) => ({
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [pg.longitude!, pg.latitude!],
            },
            properties: {
              id: pg.id,
              name: pg.name,
              pgType: pg.type,
              address: pg.address ?? "",
              distanceKm: pg.distanceKm,
              managerPhone: pg.managerPhone ?? "",
              baseRent: pg.baseRent ?? null,
            },
          }));

        map.addSource("pgs", {
          type: "geojson",
          data: { type: "FeatureCollection", features },
        });

        // Outer glow
        map.addLayer({
          id: "pg-glow",
          type: "circle",
          source: "pgs",
          paint: {
            "circle-radius": 17,
            "circle-color": "rgba(45,198,83,0.18)",
          },
        });

        // Main dot
        map.addLayer({
          id: "pg-dots",
          type: "circle",
          source: "pgs",
          paint: {
            "circle-radius": 10,
            "circle-color": "#2dc653",
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Cursor on hover
        map.on("mouseenter", "pg-dots", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "pg-dots", () => {
          map.getCanvas().style.cursor = "";
        });

        // Click → popup (no DOM marker involved, purely MapLibre API)
        map.on("click", "pg-dots", (e) => {
          if (!e.features?.length) return;

          const props = e.features[0].properties as {
            id: string;
            name: string;
            pgType: string;
            address: string;
            distanceKm: number;
            managerPhone: string;
            baseRent: number | null;
          };
          const geom = e.features[0].geometry as {
            type: "Point";
            coordinates: [number, number];
          };
          const [lng, lat] = geom.coordinates;

          const origin2 = userCoords || searchCoords;
          const dirUrl = `https://www.google.com/maps/dir/?api=1${
            origin2 ? `&origin=${origin2.lat},${origin2.lng}` : ""
          }&destination=${lat},${lng}&travelmode=driving`;

          const html = `
            <div style="font-family:Inter,sans-serif;min-width:200px;padding:2px 0">
              <div style="font-weight:800;font-size:14px;color:#111;margin-bottom:2px;line-height:1.3">${props.name}</div>
              <div style="font-size:12px;color:#555;margin-bottom:6px">
                ${typeLabel(props.pgType)} · <strong style="color:#16a34a">${distanceLabel(props.distanceKm)}</strong>
              </div>
              ${props.baseRent ? `<div style="font-size:12px;color:#d97706;font-weight:700;background:rgba(251,191,36,0.15);display:inline-block;padding:2px 8px;border-radius:999px;margin-bottom:6px;border:1px solid rgba(251,191,36,0.25)">Rent Starting from ₹${props.baseRent}</div>` : ""}
              ${props.address ? `<div style="font-size:11px;color:#777;margin-bottom:8px">📍 ${props.address}</div>` : ""}
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <a href="${dirUrl}" target="_blank" rel="noopener noreferrer"
                  style="background:#2dc653;color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">
                  🗺️ Directions</a>
                ${
                  props.managerPhone
                    ? `<a href="tel:${props.managerPhone.replace(/\D/g, "")}"
                        style="background:#f97316;color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">
                        📞 Enquire</a>`
                    : ""
                }
              </div>
            </div>
          `;

          // ── Toggle: same dot clicked again → close ──────────────────
          if (activePgId === props.id && activePopup) {
            activePopup.remove();
            activePopup = null;
            activePgId = null;
            return;
          }

          // Different dot → close old, open new
          if (activePopup) activePopup.remove();
          activePgId = props.id;

          activePopup = new ml.Popup({
            offset: [0, -14],
            maxWidth: "270px",
            closeButton: true,
            closeOnClick: false,
            focusAfterOpen: false,
            anchor: "bottom",
          })
            .setLngLat([lng, lat])
            .setHTML(html)
            .addTo(map);

          // If user closes via X button, reset tracking
          activePopup.on("close", () => {
            activePopup = null;
            activePgId = null;
          });

          if (onPGSelect) {
            const pg = pgs.find((p) => p.id === props.id);
            if (pg) onPGSelect(pg);
          }
        });

        // ── Auto-fit to show all points ───────────────────────────────
        const all: [number, number][] = [];
        if (origin) all.push([origin.lng, origin.lat]);
        pgs.forEach((pg) => {
          if (pg.latitude && pg.longitude) all.push([pg.longitude, pg.latitude]);
        });

        if (all.length > 1) {
          const lngs = all.map((c) => c[0]);
          const lats = all.map((c) => c[1]);
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            {
              padding: { top: 60, bottom: 60, left: 40, right: 40 },
              maxZoom: 15,
              duration: 600,
            }
          );
        }
      });
    }

    initMap();

    return () => {
      if (activePopup) activePopup.remove();
      if (map) map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgs, theme]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        overflow: "hidden",
      }}
    />
  );
}
