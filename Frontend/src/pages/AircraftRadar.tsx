import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import L from "leaflet";
import { MapContainer, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useMapConfig } from "../hooks/useConfig";
import { useStore } from "../store";
import type { Aircraft, WeatherCell } from "../types";
import { MapMeasurementTools } from "../components/MapMeasurementTools";
import { MapCinematicOverlay } from "../components/MapCinematicOverlay";
import { getTargetKind } from "../utils/aircraftClassification";
import {
  getAircraftClassification,
  type AircraftOperationalClassification,
} from "../utils/aircraftOperationalClassification";
import { applyAircraftFilters } from "../utils/aircraftFilters";
import { getAirlineInfo, getFlightNumber } from "../utils/airline";
import { getFlightStatusLabel } from "../utils/flightStatus";
import {
  INDIA_AIRPORTS,
  airportDisplayCode,
  countFlightsNearLocation,
  distanceKm,
  findLikelyRoute,
  type IndiaAirport,
} from "../utils/indiaAirports";
import { INDIA_LOCATIONS } from "../utils/indiaLocations";
import { INDIA_MAP_BOUNDS, INDIA_MAP_VIEW_PADDING } from "../utils/indiaViewport";
import { getNearestWeatherCell } from "../utils/weatherMap";
import { getThemeBasemapUrl } from "../utils/mapTheme";
import { getRadarOverlayPalette } from "../utils/radarOverlayTheme";

type AircraftWithTrack = Aircraft & { track?: number; heading?: number };
type AircraftClassToggles = Record<AircraftOperationalClassification, boolean>;
type AircraftTrailMap = Record<string, [number, number][]>;
type AircraftTrailSegment = {
  positions: [[number, number], [number, number]];
  opacity: number;
  weight: number;
};

type AircraftRiskVisual = {
  fillColor: string;
  ringColor: string;
  glowColor: string;
  tooltipBorder: string;
  tooltipAccent: string;
  tooltipLabel: string | null;
};

const DEFAULT_CLASS_TOGGLES: AircraftClassToggles = {
  Commercial: true,
  Helicopter: true,
  Private: true,
};

const AIRCRAFT_CLASS_BUTTONS: Array<{
  key: AircraftOperationalClassification;
  label: string;
  accent: string;
}> = [
    { key: "Commercial", label: "Commercial", accent: "#60a5fa" },
    { key: "Helicopter", label: "Helicopter", accent: "#f59e0b" },
    { key: "Private", label: "Private", accent: "#34d399" },
  ];
const MAX_TRAIL_POINTS = 20;
const INDIA_AIRCRAFT_BOUNDS: L.LatLngBoundsExpression = INDIA_MAP_BOUNDS;
const INDIA_AIRCRAFT_VIEW_PADDING: L.PointExpression = INDIA_MAP_VIEW_PADDING;
const AIRPORT_ZOOM_THRESHOLD_MAJOR = 6.1;
const AIRPORT_ZOOM_THRESHOLD_LOCAL = 7.4;
const AIRCRAFT_TAIL_POINT_COUNT = 6;

type AirportVisibilityTier = "primary" | "major" | "local";
type FlightRouteVisualization = {
  positions: [number, number][];
};

function buildPrimaryAirportIds(): Set<string> {
  const primaryAirportIds = new Set<string>();
  const capitalLocations = INDIA_LOCATIONS.filter((location) => location.kind === "capital");

  for (const capital of capitalLocations) {
    let nearestAirport: IndiaAirport | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const airport of INDIA_AIRPORTS) {
      const currentDistance = distanceKm(
        capital.latitude,
        capital.longitude,
        airport.latitude,
        airport.longitude,
      );

      if (currentDistance < nearestDistance) {
        nearestAirport = airport;
        nearestDistance = currentDistance;
      }
    }

    if (nearestAirport) {
      primaryAirportIds.add(nearestAirport.id);
    }
  }

  return primaryAirportIds;
}

const PRIMARY_AIRPORT_IDS = buildPrimaryAirportIds();

function getAirportVisibilityTier(airport: IndiaAirport): AirportVisibilityTier {
  if (PRIMARY_AIRPORT_IDS.has(airport.id)) {
    return "primary";
  }

  if (airport.iata || /international/i.test(airport.name)) {
    return "major";
  }

  return "local";
}

function airportTierRank(tier: AirportVisibilityTier): number {
  if (tier === "primary") {
    return 0;
  }

  if (tier === "major") {
    return 1;
  }

  return 2;
}

function getVisibleAirportTierRank(zoom: number): number {
  if (zoom >= AIRPORT_ZOOM_THRESHOLD_LOCAL) {
    return 2;
  }

  if (zoom >= AIRPORT_ZOOM_THRESHOLD_MAJOR) {
    return 1;
  }

  return 0;
}

function getVisibleAirportsForZoom(zoom: number): IndiaAirport[] {
  const maxTierRank = getVisibleAirportTierRank(zoom);

  return INDIA_AIRPORTS
    .filter((airport) => airportTierRank(getAirportVisibilityTier(airport)) <= maxTierRank)
    .sort((a, b) => {
      const tierDiff =
        airportTierRank(getAirportVisibilityTier(a)) - airportTierRank(getAirportVisibilityTier(b));
      if (tierDiff !== 0) {
        return tierDiff;
      }

      return a.city.localeCompare(b.city);
    });
}

function fitMapToIndia(map: L.Map, animate: boolean): void {
  map.fitBounds(INDIA_AIRCRAFT_BOUNDS, {
    padding: INDIA_AIRCRAFT_VIEW_PADDING,
    animate,
    duration: animate ? 1 : undefined,
  });
}

function getSelectedLocationFocusKey(
  selectedLocation: {
    id?: string;
    kind?: string;
    name: string;
    latitude: number;
    longitude: number;
    state?: string;
  } | null,
  locationFocusToken: number,
): string {
  if (!selectedLocation) {
    return "";
  }

  if (selectedLocation.kind === "current_location") {
    return `${selectedLocation.id ?? "current-location"}:${locationFocusToken}`;
  }

  return [
    selectedLocation.kind ?? "location",
    selectedLocation.id ?? selectedLocation.name,
    selectedLocation.state ?? "",
    selectedLocation.latitude.toFixed(4),
    selectedLocation.longitude.toFixed(4),
  ].join(":");
}

function buildFlightRouteVisualization(aircraft: AircraftWithTrack): FlightRouteVisualization | null {
  const likelyRoute = findLikelyRoute(aircraft);
  if (!likelyRoute.origin || !likelyRoute.destination) {
    return null;
  }

  const currentPosition: [number, number] = [aircraft.latitude, aircraft.longitude];
  const origin: [number, number] = [likelyRoute.origin.latitude, likelyRoute.origin.longitude];
  const destination: [number, number] = [likelyRoute.destination.latitude, likelyRoute.destination.longitude];

  const routePositions = [origin, currentPosition, destination].filter((point, index, points) => {
    const previous = index > 0 ? points[index - 1] : null;
    return !previous || !isSamePoint(previous, point);
  }) as [number, number][];

  return routePositions.length >= 2
    ? { positions: routePositions }
    : null;
}

function aircraftRotation(ac: AircraftWithTrack): number {
  const rotation = ac.track ?? ac.heading ?? 0;
  return Number.isFinite(rotation) ? rotation : 0;
}

function isSamePoint(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 0.00001 && Math.abs(a[1] - b[1]) < 0.00001;
}

function getVisibleAircraft(
  aircraft: AircraftWithTrack[],
  aircraftFilters: ReturnType<typeof useStore.getState>["aircraftFilters"],
  classToggles: AircraftClassToggles,
): AircraftWithTrack[] {
  return applyAircraftFilters(aircraft, aircraftFilters).filter((item) => {
    const classification = item.classification ?? getAircraftClassification(item);
    return classToggles[classification];
  }) as AircraftWithTrack[];
}

function buildNextTrailState(
  current: AircraftTrailMap,
  aircraft: Aircraft[],
): AircraftTrailMap {
  const next: AircraftTrailMap = {};

  for (const item of aircraft) {
    const point: [number, number] = [item.latitude, item.longitude];
    const previousTrail = current[item.icao] ?? [];
    const lastPoint = previousTrail[previousTrail.length - 1];

    if (lastPoint && isSamePoint(lastPoint, point)) {
      next[item.icao] = previousTrail;
      continue;
    }

    next[item.icao] = [...previousTrail.slice(-(MAX_TRAIL_POINTS - 1)), point];
  }

  return next;
}

function buildAircraftTrailSegments(
  trail: [number, number][],
  selected: boolean,
): AircraftTrailSegment[] {
  const tail = trail.slice(-AIRCRAFT_TAIL_POINT_COUNT);

  if (tail.length < 2) {
    return [];
  }

  const segmentCount = tail.length - 1;

  return tail.slice(1).map((point, index) => {
    const progress = (index + 1) / segmentCount;

    return {
      positions: [tail[index], point],
      opacity: selected ? 0.18 + progress * 0.42 : 0.08 + progress * 0.24,
      weight: selected ? 1.8 + progress * 1.8 : 1.1 + progress * 1.2,
    };
  });
}

function getAircraftRiskVisual(ac: AircraftWithTrack, selected: boolean): AircraftRiskVisual {
  if (ac.risk_flag === "HIGH RISK" || ac.weather_alert_level === "red") {
    return {
      fillColor: selected ? "#f87171" : "#ef4444",
      ringColor: selected ? "#fecaca" : "#fca5a5",
      glowColor: selected ? "rgba(239, 68, 68, 0.48)" : "rgba(239, 68, 68, 0.34)",
      tooltipBorder: "rgba(248, 113, 113, 0.75)",
      tooltipAccent: "#fecaca",
      tooltipLabel: "High Wind Risk",
    };
  }

  if (ac.weather_alert_level === "orange") {
    return {
      fillColor: selected ? "#fde68a" : "#facc15",
      ringColor: selected ? "#fef3c7" : "#fde047",
      glowColor: selected ? "rgba(250, 204, 21, 0.4)" : "rgba(250, 204, 21, 0.28)",
      tooltipBorder: "rgba(250, 204, 21, 0.65)",
      tooltipAccent: "#fde047",
      tooltipLabel: null,
    };
  }

  return {
    fillColor: selected ? "#ffeb3b" : "#42a5f5",
    ringColor: selected ? "#ffeb3b" : "rgba(255,255,255,0.58)",
    glowColor: selected ? "rgba(255, 235, 59, 0.34)" : "rgba(66, 165, 245, 0.22)",
    tooltipBorder: "rgba(0,212,255,0.35)",
    tooltipAccent: "#8db1cb",
    tooltipLabel: null,
  };
}

function aircraftTooltip(ac: AircraftWithTrack): string {
  const airline = getAirlineInfo(ac.callsign).airline;
  const flightNo = getFlightNumber(ac.callsign);
  const detail = `${getTargetKind(ac)} | ${airline}`;
  const status = getFlightStatusLabel(ac);
  const fl = ac.altitude > 100 ? `FL${Math.round(ac.altitude / 100).toString().padStart(3, "0")}` : "GND";
  const riskVisual = getAircraftRiskVisual(ac, false);
  const riskNotice = riskVisual.tooltipLabel
    ? `<br/><span style="font-size:8px;color:${riskVisual.tooltipAccent};text-transform:uppercase;letter-spacing:0.8px">${riskVisual.tooltipLabel}</span>`
    : "";

  return `
    <div style="
      font-family: 'Orbitron', monospace;
      font-size: 10px;
      color: #daf5ff;
      background: rgba(6,10,22,0.95);
      border: 1px solid ${riskVisual.tooltipBorder};
      border-radius: 7px;
      padding: 5px 10px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.55);
      letter-spacing: 0.5px;
      white-space: nowrap;">
      ${flightNo}
      <br/>
      <span style="font-size:8px;color:#8db1cb">${detail} | ${status} | ${fl} | ${Math.round(ac.velocity)} km/h</span>
      ${riskNotice}
    </div>
  `;
}

function aircraftIcon(ac: AircraftWithTrack, selected: boolean): L.DivIcon {
  const rotation = aircraftRotation(ac);
  const size = selected ? 38 : 32;
  const iconFill = selected ? "#fff27a" : "#ffe066";
  const glowSize = selected ? 24 : 18;
  const glowColor = selected ? "rgba(255, 226, 102, 0.38)" : "rgba(255, 214, 102, 0.24)";
  const svgMarkup = `
      <path d="M7 23 C6 23 5 22 5 20 C5 19 6 18 7 18 L12 18 L17 8 C18 6 20 5 22 5 L25 5 C26 5 27 6 27 7 L24 18 L34 18 L38 12 C39 10 41 9 43 9 L45 9 C46 9 47 10 46.5 11 L42 18 L44 18 C45.5 18 47 19 47 20 C47 21.5 45.5 23 44 23 L42 23 L46.5 30 C47 31 46 32 45 32 L43 32 C41 32 39 31 38 29 L34 23 L24 23 L27 34 C27 35 26 36 25 36 L22 36 C20 36 18 35 17 33 L12 23 Z"
        fill="${iconFill}" stroke="rgba(2,6,23,0.96)" stroke-width="1.35" stroke-linejoin="round"/>
    `;

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="position:relative;left:50%;top:50%;width:${size}px;height:${size}px;transform:translate(-50%, -50%) rotate(${rotation}deg);transform-origin:center center;will-change:transform;">
        <div style="position:absolute;left:50%;top:50%;width:${glowSize}px;height:${glowSize}px;transform:translate(-50%, -50%);border-radius:999px;background:${glowColor};filter:blur(${selected ? 9 : 7}px);opacity:${selected ? 0.92 : 0.8};"></div>
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" style="position:relative;z-index:1;overflow:visible;filter:drop-shadow(0 2px 6px rgba(15,23,42,0.42)) drop-shadow(0 0 6px rgba(255,236,153,0.24));">
          ${svgMarkup}
        </svg>
      </div>
    `,
  });
}

function airportIcon(code: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
    html: `
      <div style="position:relative;width:34px;height:34px;display:grid;place-items:center;">
        <div style="
          position:absolute;
          inset:0;
          border-radius:50%;
          background:radial-gradient(circle at 30% 30%, rgba(186,230,253,0.95), rgba(14,116,144,0.96));
          border:1px solid rgba(224,242,254,0.9);
          box-shadow:0 10px 20px rgba(8,47,73,0.32), 0 0 0 4px rgba(14,116,144,0.16);
        "></div>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="34" height="34" style="position:relative;z-index:1;">
          <circle cx="17" cy="17" r="16.5" fill="none" stroke="rgba(255,255,255,0.16)" />
          <path d="M17 8.5l2.4 5.2 5.1 2.3-5.1 2.3-2.4 7.2-2.4-7.2-5.1-2.3 5.1-2.3L17 8.5z"
            fill="#ecfeff" stroke="#083344" stroke-width="0.8" stroke-linejoin="round" />
        </svg>
        <div style="
          position:absolute;
          bottom:-6px;
          left:50%;
          transform:translateX(-50%);
          min-width:22px;
          padding:2px 5px;
          border-radius:999px;
          background:rgba(8,47,73,0.92);
          border:1px solid rgba(186,230,253,0.4);
          color:#e0f2fe;
          font:700 8px/1 Orbitron, monospace;
          letter-spacing:0.7px;
          text-align:center;
          box-shadow:0 6px 12px rgba(2,6,23,0.28);
        ">${code}</div>
      </div>
    `,
  });
}

function airportPopupContent(
  airport: (typeof INDIA_AIRPORTS)[number],
  weather: WeatherCell | null,
): string {
  const weatherSummary = weather
    ? `${Math.round(weather.data.temperature)} C · ${weather.data.condition}`
    : "Weather unavailable";
  const weatherMeta = weather
    ? `${Math.round(weather.data.wind_speed)} m/s wind · ${Math.round(weather.data.humidity)}% humidity`
    : "Live weather feed unavailable";

  return `
    <div class="wx-search-popup">
      <div class="wx-search-popup__header">Airport</div>
      <div class="wx-search-popup__value" style="font-size:20px;line-height:1.1;">${airport.name}</div>
      <div class="wx-search-popup__subvalue" style="font-size:13px;">${airport.city}, ${airport.state}</div>
      <div class="wx-search-popup__meta" style="margin-top:10px;">${airportDisplayCode(airport)} / ${airport.icao}</div>
      <div style="
        margin-top:10px;
        padding:8px 10px;
        border-radius:10px;
        background:rgba(15,23,42,0.54);
        border:1px solid rgba(148,163,184,0.14);
      ">
        <div class="wx-search-popup__header" style="margin-bottom:4px;">Weather</div>
        <div class="wx-search-popup__subvalue" style="margin-top:0;font-size:12px;color:#e0f2fe;">${weatherSummary}</div>
        <div class="wx-search-popup__meta" style="margin-top:6px;">${weatherMeta}</div>
      </div>
    </div>
  `;
}

function MapConfigController({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  const appliedViewRef = useRef<string>("");

  useEffect(() => {
    const nextViewKey = `${center[0]}:${center[1]}:${zoom}`;
    if (appliedViewRef.current === nextViewKey) {
      return;
    }

    const hasPreviousView = appliedViewRef.current !== "";
    appliedViewRef.current = nextViewKey;

    if (hasPreviousView) {
      map.flyTo(center, zoom, { animate: true, duration: 1 });
      return;
    }

    fitMapToIndia(map, false);
  }, [center, map, zoom]);

  return null;
}

function HomeResetControl() {
  const map = useMap();
  const theme = useStore((s) => s.theme);
  const overlayPalette = getRadarOverlayPalette(theme);

  const handleReset = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    fitMapToIndia(map, true);
  };

  return (
    <button
      type="button"
      className="home-reset-btn"
      onClick={handleReset}
      onMouseDown={(event) => event.stopPropagation()}
      title="Home"
      aria-label="Reset map to India view"
      style={{
        position: "absolute",
        left: 14,
        top: 82,
        zIndex: 540,
        width: 46,
        height: 46,
        borderRadius: "50%",
        border: `1px solid ${overlayPalette.homeBorder}`,
        background: overlayPalette.homeBackground,
        boxShadow: overlayPalette.panelShadow,
        color: overlayPalette.homeText,
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <span
        style={{
          fontFamily: "Orbitron, monospace",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.2,
          color: overlayPalette.homeText,
        }}
      >
        HOME
      </span>
    </button>
  );
}

export function AircraftLayer({
  classToggles = DEFAULT_CLASS_TOGGLES,
}: {
  classToggles?: AircraftClassToggles;
}) {
  const map = useMap();
  const { config: mapConfig } = useMapConfig();
  const aircraft = useStore((s) => s.aircraft) as AircraftWithTrack[];
  const aircraftFilters = useStore((s) => s.aircraftFilters);
  const selectedIcao = useStore((s) => s.selectedIcao);
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);

  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const prevPositionsRef = useRef<Map<string, [number, number]>>(new Map());
  const animationRef = useRef<Map<string, number>>(new Map());
  const visibleAircraft = useMemo(
    () => getVisibleAircraft(aircraft, aircraftFilters, classToggles),
    [aircraft, aircraftFilters, classToggles],
  );

  useEffect(() => {
    if (selectedIcao && !visibleAircraft.some((item) => item.icao === selectedIcao)) {
      setSelectedIcao(null);
    }
  }, [selectedIcao, setSelectedIcao, visibleAircraft]);

  useEffect(() => {
    const onGroundCount = visibleAircraft.filter((item) => item.on_ground).length;
    console.info("[AircraftRadar] rendered aircraft markers", {
      count: visibleAircraft.length,
      onGroundCount,
    });
  }, [visibleAircraft]);

  useEffect(() => {
    const seen = new Set<string>();

    for (const ac of visibleAircraft) {
      seen.add(ac.icao);
      const selected = selectedIcao === ac.icao;
      const existing = markersRef.current.get(ac.icao);

      if (existing) {
        existing.setIcon(aircraftIcon(ac, selected));
        existing.getTooltip()?.setContent(aircraftTooltip(ac));

        const currentPosition = existing.getLatLng();
        const prev = prevPositionsRef.current.get(ac.icao);
        if (prev && !isSamePoint(prev, [ac.latitude, ac.longitude])) {
          const fromLat = currentPosition.lat;
          const fromLng = currentPosition.lng;
          const durationMs = mapConfig.animation.aircraft_duration;
          const running = animationRef.current.get(ac.icao);
          if (running) {
            window.cancelAnimationFrame(running);
          }

          let startedAt = 0;
          const animate = (timestamp: number) => {
            if (startedAt === 0) {
              startedAt = timestamp;
            }

            const progress = Math.min(1, (timestamp - startedAt) / durationMs);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            const lat = fromLat + (ac.latitude - fromLat) * easedProgress;
            const lng = fromLng + (ac.longitude - fromLng) * easedProgress;
            existing.setLatLng([lat, lng]);

            if (progress < 1) {
              const frame = window.requestAnimationFrame(animate);
              animationRef.current.set(ac.icao, frame);
              return;
            }

            animationRef.current.delete(ac.icao);
          };

          const frame = window.requestAnimationFrame(animate);
          animationRef.current.set(ac.icao, frame);
        } else {
          existing.setLatLng([ac.latitude, ac.longitude]);
        }
      } else {
        const marker = L.marker([ac.latitude, ac.longitude], {
          icon: aircraftIcon(ac, selected),
          zIndexOffset: selected ? 1000 : 0,
        })
          .addTo(map)
          .bindTooltip(aircraftTooltip(ac), {
            className: "ac-tooltip",
            permanent: false,
            direction: "top",
            offset: [0, -10],
          })
          .on("click", (ev) => {
            L.DomEvent.stopPropagation(ev);
            const current = useStore.getState().selectedIcao;
            setSelectedIcao(current === ac.icao ? null : ac.icao);
          });
        markersRef.current.set(ac.icao, marker);
      }

      prevPositionsRef.current.set(ac.icao, [ac.latitude, ac.longitude]);
    }

    for (const [icao, marker] of markersRef.current.entries()) {
      if (!seen.has(icao)) {
        marker.remove();
        markersRef.current.delete(icao);
        prevPositionsRef.current.delete(icao);
        const frame = animationRef.current.get(icao);
        if (frame) {
          window.cancelAnimationFrame(frame);
          animationRef.current.delete(icao);
        }
      }
    }
  }, [map, mapConfig, selectedIcao, setSelectedIcao, visibleAircraft]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      animationRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
      animationRef.current.clear();
    };
  }, []);

  return null;
}

function AircraftTrailLayer({
  aircraftTrails,
  classToggles,
}: {
  aircraftTrails: AircraftTrailMap;
  classToggles: AircraftClassToggles;
}) {
  const aircraft = useStore((s) => s.aircraft) as AircraftWithTrack[];
  const aircraftFilters = useStore((s) => s.aircraftFilters);
  const selectedIcao = useStore((s) => s.selectedIcao);
  const theme = useStore((s) => s.theme);

  const visibleAircraftMap = useMemo(() => {
    return new Map(
      getVisibleAircraft(aircraft, aircraftFilters, classToggles).map((item) => [item.icao, item]),
    );
  }, [aircraft, aircraftFilters, classToggles]);

  return (
    <>
      {Object.entries(aircraftTrails).map(([icao, trail]) => {
        const aircraftItem = visibleAircraftMap.get(icao);
        if (!aircraftItem || trail.length < 2) {
          return null;
        }

        const selected = selectedIcao === icao;
        const tailSegments = buildAircraftTrailSegments(trail, selected);
        const tailPositions = trail.slice(-AIRCRAFT_TAIL_POINT_COUNT);
        const tailColor = selected
          ? theme === "night"
            ? "#fff7c2"
            : "#fcd34d"
          : theme === "night"
            ? "#fde68a"
            : "#facc15";
        const tailGlowOpacity = selected ? 0.14 : 0.08;

        if (tailSegments.length === 0) {
          return null;
        }

        return (
          <Fragment key={icao}>
            <Polyline
              positions={tailPositions}
              pathOptions={{
                color: tailColor,
                weight: selected ? 6.2 : 4.2,
                opacity: tailGlowOpacity,
                lineCap: "round",
                lineJoin: "round",
              }}
              interactive={false}
            />
            {tailSegments.map((segment, index) => (
              <Polyline
                key={`${icao}-segment-${index}`}
                positions={segment.positions}
                pathOptions={{
                  color: tailColor,
                  weight: segment.weight,
                  opacity: segment.opacity,
                  lineCap: "round",
                  lineJoin: "round",
                }}
                interactive={false}
              />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function SelectedFlightRouteLayer({
  classToggles,
}: {
  classToggles: AircraftClassToggles;
}) {
  const aircraft = useStore((s) => s.aircraft) as AircraftWithTrack[];
  const aircraftFilters = useStore((s) => s.aircraftFilters);
  const selectedIcao = useStore((s) => s.selectedIcao);
  const theme = useStore((s) => s.theme);

  const visibleAircraftMap = useMemo(() => {
    return new Map(
      getVisibleAircraft(aircraft, aircraftFilters, classToggles).map((item) => [item.icao, item]),
    );
  }, [aircraft, aircraftFilters, classToggles]);

  const selectedAircraft = selectedIcao ? visibleAircraftMap.get(selectedIcao) ?? null : null;
  const routeVisualization = useMemo(
    () => (selectedAircraft ? buildFlightRouteVisualization(selectedAircraft) : null),
    [selectedAircraft],
  );

  if (!selectedAircraft || !routeVisualization) {
    return null;
  }

  return (
    <>
      <Polyline
        positions={routeVisualization.positions}
        pathOptions={{
          color: "rgba(125, 211, 252, 0.28)",
          weight: 6,
          opacity: 0.34,
          lineCap: "round",
          lineJoin: "round",
        }}
        interactive={false}
      />
      <Polyline
        positions={routeVisualization.positions}
        pathOptions={{
          color: theme === "night" ? "#f8fafc" : "#000000",
          weight: 2.6,
          opacity: 0.88,
          dashArray: "7 10",
          lineCap: "round",
          lineJoin: "round",
        }}
        interactive={false}
      />
    </>
  );
}

function AircraftClassFilterBar({
  toggles,
  counts,
  onToggle,
}: {
  toggles: AircraftClassToggles;
  counts: Record<AircraftOperationalClassification, number>;
  onToggle: (classification: AircraftOperationalClassification) => void;
}) {
  const theme = useStore((s) => s.theme);
  const overlayPalette = getRadarOverlayPalette(theme);

  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        bottom: 18,
        zIndex: 540,
        display: "grid",
        gap: 10,
        padding: "12px",
        borderRadius: 20,
        background: overlayPalette.panelBackground,
        border: `1px solid ${overlayPalette.panelBorder}`,
        boxShadow: overlayPalette.panelShadow,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        width: "min(200px, calc(100% - 28px))",
      }}
    >
      {AIRCRAFT_CLASS_BUTTONS.map((button) => {
        const active = toggles[button.key];
        return (
          <div
            key={button.key}
            onClick={() => onToggle(button.key)}
            style={{
              width: "100%",
              background: active
                ? `linear-gradient(135deg, ${button.accent}1a, ${button.accent}05)`
                : "rgba(0,0,0,0.03)",
              border: `1px solid ${active ? `${button.accent}44` : "rgba(255,255,255,0.05)"}`,
              borderRadius: 15,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              gap: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "Orbitron, monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: active ? button.accent : overlayPalette.panelMuted,
                  marginBottom: 2,
                }}
              >
                {button.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: active ? overlayPalette.surfaceText : overlayPalette.buttonIdleText,
                  opacity: 0.85,
                }}
              >
                Visible · {counts[button.key]}
              </div>
            </div>

            {/* Premium Sliding Toggle */}
            <div
              style={{
                width: 32,
                height: 18,
                borderRadius: 18,
                background: active ? `${button.accent}33` : "rgba(0,0,0,0.15)",
                border: `1px solid ${active ? `${button.accent}55` : "rgba(255,255,255,0.1)"}`,
                position: "relative",
                transition: "background 0.3s ease",
                flexShrink: 0,
              }}
            >
              <motion.div
                initial={false}
                animate={{
                  x: active ? 16 : 2,
                  backgroundColor: active ? button.accent : "rgba(255,255,255,0.3)",
                  boxShadow: active ? `0 0 10px ${button.accent}aa` : "none",
                }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                }}
                style={{
                  position: "absolute",
                  top: 2,
                  left: 0,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MapClickReset({ disabled = false }: { disabled?: boolean }) {
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);

  useMapEvents({
    click: () => {
      if (disabled) {
        return;
      }

      setSelectedIcao(null);
    },
  });

  return null;
}

function IndiaOverviewController() {
  const map = useMap();
  const selectedIcao = useStore((s) => s.selectedIcao);
  const selectedLocation = useStore((s) => s.selectedLocation);

  useEffect(() => {
    if (selectedIcao || selectedLocation) {
      return;
    }

    fitMapToIndia(map, false);
  }, [map, selectedIcao, selectedLocation]);

  return null;
}

export function LocationController() {
  const map = useMap();
  const selectedLocation = useStore((s) => s.selectedLocation);
  const selectedIcao = useStore((s) => s.selectedIcao);
  const aircraftMap = useStore((s) => s.aircraftMap);
  const locationFocusToken = useStore((s) => s.locationFocusToken);
  const lastLocationFocusKeyRef = useRef<string>("");

  useEffect(() => {
    if (!selectedLocation) {
      lastLocationFocusKeyRef.current = "";
      return;
    }

    const focusKey = getSelectedLocationFocusKey(selectedLocation, locationFocusToken);
    if (lastLocationFocusKeyRef.current === focusKey) {
      return;
    }

    lastLocationFocusKeyRef.current = focusKey;
    map.flyTo([selectedLocation.latitude, selectedLocation.longitude], 8, { duration: 1.5 });
    const flightsNear = countFlightsNearLocation(
      useStore.getState().aircraft,
      selectedLocation.latitude,
      selectedLocation.longitude,
      50,
    );
    L.popup({ autoClose: true, closeButton: false })
      .setLatLng([selectedLocation.latitude, selectedLocation.longitude])
      .setContent(
        `<div style="font-family: 'Orbitron', monospace; font-size: 11px; padding: 4px; text-align: center; color: #111;"><b>${selectedLocation.name}</b><br/>${flightsNear} targets nearby</div>`,
      )
      .openOn(map);
  }, [locationFocusToken, map, selectedLocation]);

  useEffect(() => {
    if (!selectedIcao) {
      return;
    }

    const ac = aircraftMap.get(selectedIcao);
    if (ac) {
      map.flyTo([ac.latitude, ac.longitude], 8, { duration: 1.5 });
    }
  }, [map, selectedIcao]);

  return null;
}

function AirportLayer() {
  const map = useMap();
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);
  const setSelectedLocation = useStore((s) => s.setSelectedLocation);
  const weatherCells = useStore((s) => s.weatherCells);
  const [zoom, setZoom] = useState(() => map.getZoom());
  const visibleAirports = useMemo(() => getVisibleAirportsForZoom(zoom), [zoom]);

  useEffect(() => {
    const syncZoom = () => {
      setZoom(map.getZoom());
    };

    syncZoom();
    map.on("zoomend", syncZoom);

    return () => {
      map.off("zoomend", syncZoom);
    };
  }, [map]);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);

    visibleAirports.forEach((airport) => {
      const nearestWeather = getNearestWeatherCell(weatherCells, airport.latitude, airport.longitude);
      const marker = L.marker([airport.latitude, airport.longitude], { icon: airportIcon(airport.iata ?? airport.icao) })
        .bindTooltip(`<b>${airport.name}</b><br/>${airport.city}, ${airport.state}<br/>${airportDisplayCode(airport)} / ${airport.icao}`, {
          className: "airport-tooltip",
          direction: "top",
        })
        .bindPopup(airportPopupContent(airport, nearestWeather), {
          className: "wx-search-popup-shell",
          closeButton: true,
          offset: [0, -18],
          autoPanPadding: [32, 32],
        })
        .on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          setSelectedIcao(null);
          setSelectedLocation({
            id: airport.id,
            name: airport.name,
            city: airport.city,
            state: airport.state,
            iata: airport.iata ?? undefined,
            icao: airport.icao,
            kind: "airport",
            latitude: airport.latitude,
            longitude: airport.longitude,
          });
          marker.openPopup();
        });

      marker.addTo(group);
    });

    return () => {
      group.remove();
    };
  }, [map, setSelectedIcao, setSelectedLocation, visibleAirports, weatherCells]);

  return null;
}

function AircraftRadar() {
  const { config: mapConfig } = useMapConfig();
  const aircraft = useStore((s) => s.aircraft);
  const aircraftFilters = useStore((s) => s.aircraftFilters);
  const theme = useStore((s) => s.theme);
  const [classToggles, setClassToggles] = useState<AircraftClassToggles>(DEFAULT_CLASS_TOGGLES);
  const [aircraftTrails, setAircraftTrails] = useState<AircraftTrailMap>({});
  const [measurementDrawing, setMeasurementDrawing] = useState(false);
  const center = useMemo<[number, number]>(
    () => [mapConfig.default_center.lat, mapConfig.default_center.lon],
    [mapConfig.default_center.lat, mapConfig.default_center.lon],
  );
  const filteredAircraft = useMemo(
    () => applyAircraftFilters(aircraft, aircraftFilters),
    [aircraft, aircraftFilters],
  );
  const themedBasemapUrl = useMemo(
    () => getThemeBasemapUrl(mapConfig.tiles, theme),
    [mapConfig.tiles, theme],
  );
  const classCounts = useMemo<Record<AircraftOperationalClassification, number>>(() => {
    const counts: Record<AircraftOperationalClassification, number> = {
      Commercial: 0,
      Helicopter: 0,
      Private: 0,
    };

    for (const item of filteredAircraft) {
      const classification = item.classification ?? getAircraftClassification(item);
      counts[classification] += 1;
    }

    return counts;
  }, [filteredAircraft]);

  const handleToggleClassification = (classification: AircraftOperationalClassification) => {
    setClassToggles((current) => ({
      ...current,
      [classification]: !current[classification],
    }));
  };

  useEffect(() => {
    setAircraftTrails((current) => buildNextTrailState(current, aircraft));
  }, [aircraft]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <AircraftClassFilterBar
        toggles={classToggles}
        counts={classCounts}
        onToggle={handleToggleClassification}
      />
      <MapContainer
        center={center}
        zoom={mapConfig.default_zoom}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <MapConfigController center={center} zoom={mapConfig.default_zoom} />
        <IndiaOverviewController />
        <TileLayer key={`aircraft-basemap-${theme}`} url={themedBasemapUrl} />
        <MapCinematicOverlay theme={theme} />
        <HomeResetControl />
        <MapMeasurementTools onDrawingChange={setMeasurementDrawing} />
        <AirportLayer />
        <SelectedFlightRouteLayer classToggles={classToggles} />
        <AircraftTrailLayer aircraftTrails={aircraftTrails} classToggles={classToggles} />
        <AircraftLayer classToggles={classToggles} />
        <MapClickReset disabled={measurementDrawing} />
        <LocationController />
      </MapContainer>
    </div>
  );
}

export default AircraftRadar;
