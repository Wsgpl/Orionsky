import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useMapConfig } from "../../hooks/useConfig";
import { useStore } from "../../store";
import { INDIA_AIRPORTS } from "../../utils/indiaAirports";
import { INDIA_LOCATIONS } from "../../utils/indiaLocations";
import type { WeatherCell } from "../../types";
import { formatCoord } from "../../utils/mapHelpers";
import {
  formatWeatherValue,
  getWeatherAlertLevel,
  getNearestWeatherCell,
  getNearestWeatherPlace,
  getWeatherCellModeValue,
  getWeatherPlaceKey,
  normalizeStateKey,
  WEATHER_STATE_BASES,
} from "../../utils/weatherMap";
import { getThemeBasemapUrl } from "../../utils/mapTheme";
import { getRadarOverlayPalette } from "../../utils/radarOverlayTheme";
import type { WeatherMode } from "../../types";
import { INDIA_MAP_BOUNDS, INDIA_MAP_VIEW_PADDING } from "../../utils/indiaViewport";
import { MapMeasurementTools, type MapMeasurementState } from "../MapMeasurementTools";
import { MapCinematicOverlay } from "../MapCinematicOverlay";
import { WeatherSidebar, type WeatherSidebarSelection } from "./WeatherSidebar";

const WEATHER_MAJOR_CITY_NAMES = new Set(
  [
    ...INDIA_LOCATIONS.filter((location) => location.kind === "capital").map((location) => location.name),
    ...INDIA_AIRPORTS.map((airport) => airport.city),
  ].map((value) => value.toLowerCase()),
);

const WIND_CANVAS_PANE_NAME = "weather-wind-canvas-pane";
const WEATHER_ALERT_ZONE_PANE_NAME = "weather-alert-zone-pane";
const DEFAULT_WIND_DIRECTION = 110;
const DEFAULT_WIND_SPEED = 6;
const PARTICLE_MARGIN = 24;
const MAX_ALERT_ZONES = 18;
const INDIA_WEATHER_BOUNDS: L.LatLngBoundsExpression = INDIA_MAP_BOUNDS;
const INDIA_WEATHER_VIEW_PADDING: L.PointExpression = INDIA_MAP_VIEW_PADDING;
const NORTHERN_OVERVIEW_STATE_KEYS = new Set([
  "arunachal-pradesh",
  "himachal-pradesh",
  "jammu-and-kashmir",
  "ladakh",
  "sikkim",
  "uttarakhand",
]);

type WeatherStateView = {
  state: string;
  stateKey: string;
  cities: Array<{
    key: string;
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    state?: string;
    weather: WeatherCell | null;
    value: number | null;
    valueLabel: string;
  }>;
  polygon: Array<[number, number]>;
  bounds: [[number, number], [number, number]];
  center: [number, number];
  cityCount: number;
  weatherCityCount: number;
  averageValue: number | null;
};

type WeatherWindConfig = {
  wind_particles_count: number;
  wind_particle_speed: number;
};

type WindField = {
  direction: number;
  speed: number;
};

type WindVector = {
  x: number;
  y: number;
};

type WindParticle = {
  x: number;
  y: number;
  age: number;
  ttl: number;
  sway: number;
  drift: number;
  alpha: number;
  width: number;
};

type CanvasMetrics = {
  width: number;
  height: number;
  dpr: number;
};

type WeatherAlertZone = {
  key: string;
  center: [number, number];
  radius: number;
  color: string;
  fillColor: string;
  fillOpacity: number;
  opacity: number;
  weight: number;
};

type WeatherLegendConfig = {
  title: string;
  leftLabel: string;
  rightLabel: string;
  gradient: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fitWeatherMapToIndia(map: L.Map, animate: boolean): void {
  map.fitBounds(INDIA_WEATHER_BOUNDS, {
    padding: INDIA_WEATHER_VIEW_PADDING,
    animate,
    duration: animate ? 1 : undefined,
  });
}

function getSelectedLocationFocusKey(
  selectedLocation: { id?: string; name: string; kind?: string; state?: string; latitude: number; longitude: number } | null,
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

function ensureWindCanvasPane(map: L.Map): HTMLElement {
  const pane = map.getPane(WIND_CANVAS_PANE_NAME) ?? map.createPane(WIND_CANVAS_PANE_NAME);
  pane.style.zIndex = "750";
  pane.style.pointerEvents = "none";
  return pane;
}

function ensureWeatherAlertZonePane(map: L.Map): HTMLElement {
  const pane = map.getPane(WEATHER_ALERT_ZONE_PANE_NAME) ?? map.createPane(WEATHER_ALERT_ZONE_PANE_NAME);
  pane.style.zIndex = "420";
  pane.style.pointerEvents = "none";
  return pane;
}

function getWeatherAlertZoneRadius(windSpeed: number, alertLevel: "orange" | "red"): number {
  if (alertLevel === "red") {
    return clamp(24000 + Math.max(0, windSpeed - 15) * 4200, 24000, 52000);
  }

  return clamp(15000 + Math.max(0, windSpeed - 8) * 3200, 15000, 32000);
}

function buildWeatherAlertZones(weatherCells: WeatherCell[]): WeatherAlertZone[] {
  const candidates = weatherCells
    .map((cell) => {
      const alertLevel = getWeatherAlertLevel(cell);

      if (alertLevel === null || alertLevel === "yellow") {
        return null;
      }

      const windSpeed = Number(cell.data.wind_speed);
      if (
        !Number.isFinite(cell.data.latitude) ||
        !Number.isFinite(cell.data.longitude) ||
        !Number.isFinite(windSpeed)
      ) {
        return null;
      }

      const isSevere = alertLevel === "red";

      return {
        key: cell.cell_key,
        center: [cell.data.latitude, cell.data.longitude] as [number, number],
        radius: getWeatherAlertZoneRadius(windSpeed, alertLevel),
        windSpeed,
        severityRank: isSevere ? 2 : 1,
        color: isSevere ? "#dc2626" : "#f97316",
        fillColor: isSevere ? "#f87171" : "#fb923c",
        fillOpacity: isSevere ? 0.15 : 0.11,
        opacity: isSevere ? 0.88 : 0.8,
        weight: isSevere ? 2.2 : 1.8,
      };
    })
    .filter((zone): zone is WeatherAlertZone & { windSpeed: number; severityRank: number } => zone !== null)
    .sort((a, b) => {
      if (a.severityRank !== b.severityRank) {
        return b.severityRank - a.severityRank;
      }

      return b.windSpeed - a.windSpeed;
    });

  const deduped: WeatherAlertZone[] = [];

  for (const candidate of candidates) {
    const overlapsExisting = deduped.some((existing) => {
      const candidateCenter = L.latLng(candidate.center[0], candidate.center[1]);
      const existingCenter = L.latLng(existing.center[0], existing.center[1]);
      const distance = candidateCenter.distanceTo(existingCenter);
      const minSeparation = Math.min(candidate.radius, existing.radius) * 0.92;

      return distance < minSeparation;
    });

    if (overlapsExisting) {
      continue;
    }

    deduped.push({
      key: candidate.key,
      center: candidate.center,
      radius: candidate.radius,
      color: candidate.color,
      fillColor: candidate.fillColor,
      fillOpacity: candidate.fillOpacity,
      opacity: candidate.opacity,
      weight: candidate.weight,
    });

    if (deduped.length >= MAX_ALERT_ZONES) {
      break;
    }
  }

  return deduped;
}

function buildWindField(weatherCells: WeatherCell[]): WindField {
  const validCells = weatherCells.filter(
    (cell) =>
      Number.isFinite(cell.data.wind_speed) &&
      Number.isFinite(cell.data.wind_direction),
  );

  if (validCells.length === 0) {
    return {
      direction: DEFAULT_WIND_DIRECTION,
      speed: DEFAULT_WIND_SPEED,
    };
  }

  const directionComponents = validCells.reduce(
    (acc, cell) => {
      const radians = (cell.data.wind_direction * Math.PI) / 180;
      acc.sin += Math.sin(radians);
      acc.cos += Math.cos(radians);
      return acc;
    },
    { sin: 0, cos: 0 },
  );

  const averageSpeed =
    validCells.reduce((sum, cell) => sum + cell.data.wind_speed, 0) / validCells.length;

  const averageDirection =
    ((Math.atan2(directionComponents.sin, directionComponents.cos) * 180) / Math.PI + 360) % 360;

  return {
    direction: averageDirection,
    speed: clamp(averageSpeed, 2, 18),
  };
}

function windFieldToVector(field: WindField, animation: WeatherWindConfig): WindVector {
  const radians = (((field.direction % 360) + 360) % 360) * (Math.PI / 180);
  const magnitude =
    clamp(animation.wind_particle_speed, 0.35, 2.4) * (0.55 + field.speed * 0.06);

  return {
    x: -Math.sin(radians) * magnitude,
    y: -Math.cos(radians) * magnitude,
  };
}

function getParticleCount(
  width: number,
  height: number,
  animation: WeatherWindConfig,
): number {
  const viewportDensity = Math.floor((width * height) / 5000);
  const requested = Math.floor(animation.wind_particles_count / 8);
  return clamp(Math.min(viewportDensity, requested), 120, 360);
}

function seedWindParticle(
  width: number,
  height: number,
  vector: WindVector,
): WindParticle {
  const particle: WindParticle = {
    x: 0,
    y: 0,
    age: 0,
    ttl: 0,
    sway: 0,
    drift: 0,
    alpha: 0,
    width: 0,
  };

  return resetWindParticle(particle, width, height, vector);
}

function resetWindParticle(
  particle: WindParticle,
  width: number,
  height: number,
  vector: WindVector,
): WindParticle {
  const horizontalFlowDominant = Math.abs(vector.x) >= Math.abs(vector.y);

  if (horizontalFlowDominant) {
    particle.x = vector.x >= 0 ? -PARTICLE_MARGIN : width + PARTICLE_MARGIN;
    particle.y = Math.random() * height;
  } else {
    particle.x = Math.random() * width;
    particle.y = vector.y >= 0 ? -PARTICLE_MARGIN : height + PARTICLE_MARGIN;
  }

  particle.age = 0;
  particle.ttl = 90 + Math.random() * 80;
  particle.sway = (Math.random() - 0.5) * 1.4;
  particle.drift = (Math.random() - 0.5) * 0.9;
  particle.alpha = 0.3 + Math.random() * 0.4;
  particle.width = 0.8 + Math.random() * 1.2;

  return particle;
}

function drawWindFrame(
  ctx: CanvasRenderingContext2D,
  particles: WindParticle[],
  vector: WindVector,
  width: number,
  height: number,
  elapsedMs: number,
): void {
  const timeScale = clamp(elapsedMs / 16.67, 0.75, 1.8);
  const timeFactor = elapsedMs * 0.0015;

  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";

  for (const particle of particles) {
    const prevX = particle.x;
    const prevY = particle.y;

    const curl =
      Math.sin((particle.y * 0.018) + timeFactor + particle.sway) * 0.35 +
      Math.cos((particle.x * 0.012) - timeFactor + particle.drift) * 0.2;
    const lift =
      Math.cos((particle.x * 0.01) + timeFactor + particle.sway) * 0.22;

    particle.x += (vector.x + curl + particle.drift * 0.18) * timeScale;
    particle.y += (vector.y + lift + particle.sway * 0.14) * timeScale;
    particle.age += timeScale;

    const outOfBounds =
      particle.x < -PARTICLE_MARGIN ||
      particle.x > width + PARTICLE_MARGIN ||
      particle.y < -PARTICLE_MARGIN ||
      particle.y > height + PARTICLE_MARGIN;

    if (outOfBounds || particle.age > particle.ttl) {
      resetWindParticle(particle, width, height, vector);
      continue;
    }

    ctx.beginPath();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.lineWidth = particle.width;
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(particle.x, particle.y);
    ctx.stroke();
  }
}

function syncWindCanvas(
  map: L.Map,
  canvas: HTMLCanvasElement,
  metricsRef: React.MutableRefObject<CanvasMetrics>,
): CanvasMetrics {
  const size = map.getSize();
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

  if (
    metricsRef.current.width !== size.x ||
    metricsRef.current.height !== size.y ||
    metricsRef.current.dpr !== dpr
  ) {
    canvas.width = Math.floor(size.x * dpr);
    canvas.height = Math.floor(size.y * dpr);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
    }

    metricsRef.current = {
      width: size.x,
      height: size.y,
      dpr,
    };
  }

  L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
  return metricsRef.current;
}

function getWeatherLegendConfig(mode: Exclude<WeatherMode, "none">): WeatherLegendConfig {
  switch (mode) {
    case "temperature":
      return {
        title: "Temperature",
        leftLabel: "Cold",
        rightLabel: "Hot",
        gradient: "linear-gradient(90deg, #2563eb 0%, #facc15 52%, #dc2626 100%)",
      };
    case "wind":
      return {
        title: "Wind",
        leftLabel: "Calm",
        rightLabel: "Strong",
        gradient: "linear-gradient(90deg, #dbeafe 0%, #7dd3fc 42%, #2563eb 100%)",
      };
    case "precipitation":
      return {
        title: "Rain",
        leftLabel: "Light",
        rightLabel: "Heavy",
        gradient: "linear-gradient(90deg, #86efac 0%, #2dd4bf 48%, #2563eb 100%)",
      };
    case "humidity":
      return {
        title: "Humidity",
        leftLabel: "Dry",
        rightLabel: "Humid",
        gradient: "linear-gradient(90deg, #e0f2fe 0%, #7dd3fc 46%, #2563eb 100%)",
      };
    case "pressure":
      return {
        title: "Pressure",
        leftLabel: "Low",
        rightLabel: "High",
        gradient: "linear-gradient(90deg, #e0e7ff 0%, #a5b4fc 48%, #4f46e5 100%)",
      };
  }
}

function WeatherLegendBar({
  activeMode,
}: {
  activeMode: Exclude<WeatherMode, "none">;
}) {
  const config = getWeatherLegendConfig(activeMode);

  return (
    <div
      style={{
        position: "absolute",
        left: 18,
        bottom: 18,
        zIndex: 940,
        minWidth: 210,
        maxWidth: 260,
        padding: "12px 14px",
        borderRadius: 16,
        background: "rgba(255, 255, 255, 0.68)",
        border: "1px solid rgba(148, 163, 184, 0.24)",
        boxShadow: "0 18px 32px rgba(15, 23, 42, 0.12)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "Orbitron, monospace",
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: "#0f172a",
        }}
      >
        {config.title} Scale
      </div>
      <div
        style={{
          height: 12,
          borderRadius: 999,
          background: config.gradient,
          boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.38)",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 12,
          color: "#475569",
          lineHeight: 1.2,
        }}
      >
        <span>{config.leftLabel}</span>
        <span>{config.rightLabel}</span>
      </div>
    </div>
  );
}

function WeatherMarkerMotionStyles() {
  return (
    <style>
      {`
        @keyframes weatherMarkerFadeIn {
          0% {
            opacity: 0;
            transform: translate3d(0, 10px, 0) scale(0.94);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes weatherMarkerPulse {
          0%, 100% {
            transform: scale(1);
            filter: saturate(1);
          }
          50% {
            transform: scale(1.035);
            filter: saturate(1.05);
          }
        }

        @keyframes weatherMarkerDotPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.84;
          }
          50% {
            transform: scale(1.18);
            opacity: 1;
          }
        }
      `}
    </style>
  );
}

export function WeatherMap() {
  const { config: mapConfig } = useMapConfig();
  const weatherCells = useStore((s) => s.weatherCells);
  const weatherLoading = useStore((s) => s.weatherLoading);
  const activeWeatherMode = useStore((s) => s.activeWeatherMode);
  const theme = useStore((s) => s.theme);
  const showWeatherMarkers = activeWeatherMode !== "none";
  const showWindLayer = activeWeatherMode === "wind";
  const selectedLocation = useStore((s) => s.selectedLocation);
  const setSelectedLocation = useStore((s) => s.setSelectedLocation);
  const [mapZoom, setMapZoom] = useState(mapConfig.weather_zoom);
  const [sidebarSelection, setSidebarSelection] = useState<WeatherSidebarSelection | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [measurementModeActive, setMeasurementModeActive] = useState(false);
  const hasWeatherData = weatherCells.length > 0;

  const stateViews = useMemo<WeatherStateView[]>(() => {
    return WEATHER_STATE_BASES.map((base) => {
      const cities = base.cities.map((city) => {
        const weather = getNearestWeatherCell(weatherCells, city.latitude, city.longitude);
        const value = weather ? getWeatherCellModeValue(weather, activeWeatherMode) : null;
        const valueLabel = formatWeatherValue(activeWeatherMode, value);

        return {
          key: getWeatherPlaceKey(city),
          id: city.id,
          name: city.name,
          latitude: city.latitude,
          longitude: city.longitude,
          state: city.state,
          weather,
          value,
          valueLabel,
        };
      });

      const activeValues = cities
        .map((item) => item.value)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const weatherCityCount = activeValues.length;
      const averageValue = weatherCityCount
        ? activeValues.reduce((sum, value) => sum + value, 0) / weatherCityCount
        : null;

      return {
        state: base.state,
        stateKey: base.stateKey,
        cities: cities.sort((a, b) => a.name.localeCompare(b.name)),
        polygon: base.polygon,
        bounds: base.bounds,
        center: base.center,
        cityCount: cities.length,
        weatherCityCount,
        averageValue,
      };
    });
  }, [activeWeatherMode, weatherCells]);

  const selectedStateKey = normalizeStateKey(selectedLocation?.state ?? (selectedLocation?.kind === "state" ? selectedLocation.name : undefined));
  const selectedState = stateViews.find((state) => state.stateKey === selectedStateKey) ?? null;
  const selectedCityKey = selectedLocation && selectedLocation.kind !== "state"
    ? getWeatherPlaceKey(selectedLocation)
    : null;
  const sidebarWeather = useMemo(() => {
    if (!sidebarSelection) {
      return null;
    }

    return getNearestWeatherCell(
      weatherCells,
      sidebarSelection.latitude,
      sidebarSelection.longitude,
    );
  }, [sidebarSelection, weatherCells]);
  const themedBasemapUrl = useMemo(
    () => getThemeBasemapUrl(mapConfig.tiles, theme),
    [mapConfig.tiles, theme],
  );

  const openLocationWeatherSidebar = (nextSelection: WeatherSidebarSelection) => {
    setSidebarSelection(nextSelection);
    setIsSidebarOpen(true);
  };

  return (
    <div className="weather-map-shell">
      <WeatherMarkerMotionStyles />
      <MapContainer
        center={[mapConfig.weather_center.lat, mapConfig.weather_center.lon]}
        zoom={mapConfig.weather_zoom}
        zoomControl={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer key={`weather-basemap-${theme}`} url={themedBasemapUrl} />
        <MapCinematicOverlay theme={theme} />
        <WeatherHomeResetControl />
        <MapMeasurementTools
          floatingResult
          onMeasurementStateChange={(state: MapMeasurementState) => {
            const active = state.measurementMode !== "none";
            setMeasurementModeActive(active);
            if (active) {
              setIsSidebarOpen(false);
            }
          }}
        />
        {showWindLayer && <WindCanvasLayer weatherCells={weatherCells} animation={mapConfig.animation} />}
        {showWeatherMarkers && <WeatherAlertZoneLayer weatherCells={weatherCells} />}
        <WeatherMapZoomTracker onZoomChange={setMapZoom} />
        <WeatherMapController selectedLocation={selectedLocation} stateViews={stateViews} />
        <WeatherMapProbeClick
          hasSelectedState={!!selectedState}
          measurementModeActive={measurementModeActive}
          onClearSelection={() => {
            setSelectedLocation(null);
          }}
          onProbe={(position) => {
            const nearestPlace = getNearestWeatherPlace(position[0], position[1]);
            openLocationWeatherSidebar({
              latitude: position[0],
              longitude: position[1],
              label: nearestPlace?.name,
              subtitle: nearestPlace?.state,
            });
          }}
        />
        {showWeatherMarkers && (
          <WeatherStateMarkerLayer
            stateViews={stateViews}
            activeStateKey={selectedStateKey}
            animationSeed={activeWeatherMode}
            mapZoom={mapZoom}
            onSelectState={(state) => {
              setIsSidebarOpen(false);
              setSelectedLocation({
                id: state.stateKey,
                name: state.state,
                kind: "state",
                state: state.state,
                latitude: state.center[0],
                longitude: state.center[1],
              });
            }}
          />
        )}
        {showWeatherMarkers && selectedState && (
          <WeatherCityLayer
            stateView={selectedState}
            activeMode={activeWeatherMode}
            mapZoom={mapZoom}
            selectedCityKey={selectedCityKey}
            onSelectCity={(city) => {
              setSelectedLocation({
                id: city.id,
                name: city.name,
                kind: "region",
                state: city.state ?? selectedState.state,
                latitude: city.latitude,
                longitude: city.longitude,
              });
            }}
            onInspectCity={(city) => {
              openLocationWeatherSidebar({
                latitude: city.latitude,
                longitude: city.longitude,
                label: city.name,
                subtitle: city.state ?? selectedState.state,
              });
            }}
          />
        )}
      </MapContainer>
      <WeatherSidebar
        isOpen={isSidebarOpen}
        selection={sidebarSelection}
        weatherCell={sidebarWeather}
        onClose={() => setIsSidebarOpen(false)}
      />
      {showWeatherMarkers && (
        <WeatherLegendBar activeMode={activeWeatherMode as Exclude<WeatherMode, "none">} />
      )}
      {weatherLoading && (
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            zIndex: 950,
            maxWidth: 320,
            padding: "12px 14px",
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.72)",
            border: "1px solid rgba(148, 163, 184, 0.24)",
            boxShadow: "0 18px 32px rgba(15, 23, 42, 0.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            color: "#0f172a",
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="rgba(14, 116, 144, 0.18)" strokeWidth="3" />
              <path d="M12 3a9 9 0 0 1 9 9" stroke="#0284c7" strokeWidth="3" strokeLinecap="round">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 12 12"
                  to="360 12 12"
                  dur="0.9s"
                  repeatCount="indefinite"
                />
              </path>
            </svg>
            <div
              style={{
                fontFamily: "Orbitron, monospace",
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: "#0f766e",
              }}
            >
              {hasWeatherData ? "Refreshing Weather Map" : "Loading Weather Map"}
            </div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "#334155" }}>
            Syncing weather cells and advisories for the current map view.
          </div>
        </div>
      )}
      {!weatherLoading && !hasWeatherData && (
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            zIndex: 950,
            maxWidth: 320,
            padding: "12px 14px",
            borderRadius: 16,
            background: "rgba(8, 15, 28, 0.88)",
            border: "1px solid rgba(248, 113, 113, 0.28)",
            boxShadow: "0 18px 32px rgba(2, 6, 23, 0.36)",
            backdropFilter: "blur(12px)",
            color: "#e2e8f0",
          }}
        >
          <div
            style={{
              fontFamily: "Orbitron, monospace",
              fontSize: 11,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "#fda4af",
              marginBottom: 6,
            }}
          >
            Weather Feed Empty
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "#cbd5e1" }}>
            No weather cells were loaded from the backend yet. If this stays empty, check the weather worker
            and the Open-Meteo backend configuration.
          </div>
        </div>
      )}
    </div>
  );
}

function WeatherHomeResetControl() {
  const map = useMap();
  const theme = useStore((s) => s.theme);
  const overlayPalette = getRadarOverlayPalette(theme);

  const handleReset = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    fitWeatherMapToIndia(map, true);
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

function WindCanvasLayer({
  weatherCells,
  animation,
}: {
  weatherCells: WeatherCell[];
  animation: WeatherWindConfig;
}) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const particlesRef = useRef<WindParticle[]>([]);
  const metricsRef = useRef<CanvasMetrics>({
    width: 0,
    height: 0,
    dpr: 1,
  });
  const lastFrameTimeRef = useRef<number | null>(null);

  const windField = useMemo(() => buildWindField(weatherCells), [weatherCells]);

  useEffect(() => {
    const pane = ensureWindCanvasPane(map);
    const canvas = L.DomUtil.create("canvas", "leaflet-wind-canvas", pane);
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.opacity = "0.8";
    canvasRef.current = canvas;

    const syncCanvas = () => {
      const metrics = syncWindCanvas(map, canvas, metricsRef);
      const vector = windFieldToVector(windField, animation);
      const targetParticleCount = getParticleCount(metrics.width, metrics.height, animation);

      if (particlesRef.current.length !== targetParticleCount) {
        particlesRef.current = Array.from(
          { length: targetParticleCount },
          () => seedWindParticle(metrics.width, metrics.height, vector),
        );
      }
    };

    const renderFrame = (timestamp: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        frameRef.current = window.requestAnimationFrame(renderFrame);
        return;
      }

      const metrics = metricsRef.current;
      if (metrics.width === 0 || metrics.height === 0) {
        syncCanvas();
        frameRef.current = window.requestAnimationFrame(renderFrame);
        return;
      }

      const elapsedMs =
        lastFrameTimeRef.current === null ? 16.67 : timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      drawWindFrame(
        ctx,
        particlesRef.current,
        windFieldToVector(windField, animation),
        metrics.width,
        metrics.height,
        elapsedMs,
      );

      frameRef.current = window.requestAnimationFrame(renderFrame);
    };

    syncCanvas();
    frameRef.current = window.requestAnimationFrame(renderFrame);

    map.on("move", syncCanvas);
    map.on("zoom", syncCanvas);
    map.on("resize", syncCanvas);

    return () => {
      map.off("move", syncCanvas);
      map.off("zoom", syncCanvas);
      map.off("resize", syncCanvas);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }

      lastFrameTimeRef.current = null;
      particlesRef.current = [];
      canvas.remove();
      canvasRef.current = null;
    };
  }, [
    animation,
    animation.wind_particle_speed,
    animation.wind_particles_count,
    map,
    windField,
  ]);

  return null;
}

function WeatherAlertZoneLayer({ weatherCells }: { weatherCells: WeatherCell[] }) {
  const map = useMap();
  const alertZones = useMemo(() => buildWeatherAlertZones(weatherCells), [weatherCells]);

  useEffect(() => {
    ensureWeatherAlertZonePane(map);

    const layerGroup = L.layerGroup().addTo(map);

    for (const zone of alertZones) {
      L.circle(zone.center, {
        pane: WEATHER_ALERT_ZONE_PANE_NAME,
        radius: zone.radius,
        color: zone.color,
        fillColor: zone.fillColor,
        fillOpacity: zone.fillOpacity,
        opacity: zone.opacity,
        weight: zone.weight,
        interactive: false,
        bubblingMouseEvents: false,
      }).addTo(layerGroup);
    }

    return () => {
      layerGroup.remove();
    };
  }, [alertZones, map]);

  return null;
}

function WeatherMapController({
  selectedLocation,
  stateViews,
}: {
  selectedLocation: { name: string; kind?: string; state?: string; latitude: number; longitude: number } | null;
  stateViews: WeatherStateView[];
}) {
  const map = useMap();
  const initialIndiaFitDoneRef = useRef(false);
  const lastSelectionFocusKeyRef = useRef("");
  const locationFocusToken = useStore((state) => state.locationFocusToken);

  useEffect(() => {
    if (!selectedLocation) {
      lastSelectionFocusKeyRef.current = "";
      if (!initialIndiaFitDoneRef.current) {
        initialIndiaFitDoneRef.current = true;
        fitWeatherMapToIndia(map, false);
      }
      return;
    }

    const focusKey = getSelectedLocationFocusKey(selectedLocation, locationFocusToken);
    if (lastSelectionFocusKeyRef.current === focusKey) {
      return;
    }

    lastSelectionFocusKeyRef.current = focusKey;

    const selectedStateKey = normalizeStateKey(selectedLocation.state ?? (selectedLocation.kind === "state" ? selectedLocation.name : undefined));
    const stateView = stateViews.find((state) => state.stateKey === selectedStateKey);

    if (stateView && selectedLocation.kind === "state") {
      map.fitBounds(L.latLngBounds(stateView.bounds), {
        padding: [56, 56],
        maxZoom: 6.2,
        animate: true,
        duration: 1.2,
      });
      return;
    }

    if (stateView) {
      map.flyTo([selectedLocation.latitude, selectedLocation.longitude], 7.8, {
        animate: true,
        duration: 1.2,
      });
      return;
    }

    map.flyTo([selectedLocation.latitude, selectedLocation.longitude], 7.4, {
      animate: true,
      duration: 1.2,
    });
  }, [locationFocusToken, map, selectedLocation, stateViews]);

  return null;
}

function WeatherMapProbeClick({
  hasSelectedState,
  measurementModeActive,
  onClearSelection,
  onProbe,
}: {
  hasSelectedState: boolean;
  measurementModeActive: boolean;
  onClearSelection: () => void;
  onProbe: (position: [number, number]) => void;
}) {
  useMapEvents({
    click: (event) => {
      if (measurementModeActive) {
        return;
      }

      if (hasSelectedState) {
        onClearSelection();
      }

      onProbe([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

function WeatherProbeDrawer({
  position,
  weatherCell,
  onClose,
}: {
  position: [number, number];
  weatherCell: WeatherCell | null;
  onClose: () => void;
}) {
  const weather = weatherCell?.data ?? null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`wx-probe-drawer ${open ? "wx-probe-drawer--open" : ""}`}>
      <div className="wx-probe-popup">
        <div className="wx-probe-popup__header">
          <div>
            <div className="wx-probe-popup__title">Weather Probe</div>
            <div className="wx-probe-popup__meta">
              {formatCoord(position[0], "lat")}, {formatCoord(position[1], "lon")}
            </div>
          </div>
          <button type="button" className="wx-probe-popup__close" onClick={onClose} aria-label="Close weather probe">x</button>
        </div>
        <div className="wx-probe-popup__context">
          {weather?.condition ?? "Unavailable"}
        </div>
        <div className="wx-probe-popup__list">
          <WeatherProbeRow
            kind="temperature"
            label="Temperature"
            value={weather ? formatWeatherValue("temperature", weather.temperature) : "Unavailable"}
          />
          <WeatherProbeRow
            kind="wind"
            label="Wind"
            value={weather ? formatWeatherValue("wind", weather.wind_speed) : "Unavailable"}
          />
          <WeatherProbeRow
            kind="precipitation"
            label="Precipitation"
            value={
              weather && weather.precip_mm !== undefined && weather.precip_mm !== null
                ? formatWeatherValue("precipitation", weather.precip_mm)
                : "Unavailable"
            }
          />
          <WeatherProbeRow
            kind="humidity"
            label="Humidity"
            value={weather ? formatWeatherValue("humidity", weather.humidity) : "Unavailable"}
          />
          <WeatherProbeRow
            kind="pressure"
            label="Pressure"
            value={weather ? formatWeatherValue("pressure", weather.pressure) : "Unavailable"}
          />
        </div>
      </div>
    </div>
  );
}

function WeatherMapZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const syncZoom = () => onZoomChange(map.getZoom());

    syncZoom();
    map.on("zoomend", syncZoom);
    map.on("moveend", syncZoom);

    return () => {
      map.off("zoomend", syncZoom);
      map.off("moveend", syncZoom);
    };
  }, [map, onZoomChange]);

  return null;
}

type WeatherProbeMetricKind = "temperature" | "wind" | "precipitation" | "humidity" | "pressure";
type WeatherMarkerKind = Exclude<WeatherMode, "none">;

type WeatherMarkerTone = {
  accent: string;
  accentSoft: string;
  border: string;
  text: string;
  value: string;
  shadow: string;
};

type WeatherStateMarkerMetrics = {
  size: number;
  dotSize: number;
  anchorY: number;
  tooltipOffsetY: number;
};

type WeatherCityMarkerMetrics = {
  width: number;
  height: number;
  badgeHeight: number;
  fontSize: number;
  windBadgeSize: number;
  gap: number;
  paddingX: number;
  borderRadius: number;
  offsetY: number;
};

function WeatherProbeRow({
  kind,
  label,
  value,
}: {
  kind: WeatherProbeMetricKind;
  label: string;
  value: string;
}) {
  return (
    <div className={`wx-probe-row wx-probe-row--${kind}`}>
      <span className="wx-probe-row__icon" aria-hidden="true">
        <WeatherProbeMetricIcon kind={kind} />
      </span>
      <span className="wx-probe-row__label">{label}</span>
      <span className="wx-probe-row__value">{value}</span>
    </div>
  );
}

function WeatherProbeMetricIcon({ kind }: { kind: WeatherProbeMetricKind }) {
  switch (kind) {
    case "temperature":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M10.5 6.5a1.5 1.5 0 0 1 3 0v8.1a4.5 4.5 0 1 1-3 0z" />
          <path d="M12 6.5v8.5" />
          <circle cx="12" cy="18.2" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "wind":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M3 8h10.2c1.8 0 3.3-1.4 3.3-3.1S15 1.8 13.2 1.8c-1.4 0-2.6.8-3.1 2" />
          <path d="M3 12h14.8c1.6 0 2.9 1.2 2.9 2.7 0 1.6-1.3 2.8-2.9 2.8H10.8" />
          <path d="M3 16.5h7.3c1.5 0 2.7 1.1 2.7 2.5s-1.2 2.5-2.7 2.5" />
        </svg>
      );
    case "precipitation":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M7 17.5a5.5 5.5 0 1 1 1.2-10.8A7 7 0 0 1 20 9.3a4.5 4.5 0 0 1-1.4 8.2H7z" />
          <path d="M8.3 19.1v2.4" />
          <path d="M12 19.1v2.4" />
          <path d="M15.7 19.1v2.4" />
        </svg>
      );
    case "humidity":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 2.8C8.6 6.8 6.2 10 6.2 13.4a5.8 5.8 0 1 0 11.6 0c0-3.4-2.4-6.6-5.8-10.6z" />
          <path d="M9.5 14.4a2.9 2.9 0 0 0 5 1.9" />
        </svg>
      );
    case "pressure":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 12l4.6-3.2" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <path d="M12 5.6v1.4M7.8 7.8l1 1M5.6 12h1.4M17 12h1.4M15.2 7.8l1-1" />
        </svg>
      );
    default:
      return null;
  }
}

function getWeatherMarkerTone(mode: WeatherMarkerKind, value: number | null, hasWeather: boolean): WeatherMarkerTone {
  if (!hasWeather || value === null || !Number.isFinite(value)) {
    return {
      accent: "#6b7280",
      accentSoft: "rgba(148, 163, 184, 0.2)",
      border: "rgba(148, 163, 184, 0.45)",
      text: "#0f172a",
      value: "#334155",
      shadow: "0 14px 30px rgba(15, 23, 42, 0.14)",
    };
  }

  switch (mode) {
    case "temperature":
      if (value < 22) {
        return {
          accent: "#2563eb",
          accentSoft: "rgba(59, 130, 246, 0.18)",
          border: "rgba(37, 99, 235, 0.42)",
          text: "#0f172a",
          value: "#1d4ed8",
          shadow: "0 14px 28px rgba(37, 99, 235, 0.18)",
        };
      }

      if (value < 34) {
        return {
          accent: "#f59e0b",
          accentSoft: "rgba(245, 158, 11, 0.18)",
          border: "rgba(245, 158, 11, 0.45)",
          text: "#0f172a",
          value: "#b45309",
          shadow: "0 14px 28px rgba(217, 119, 6, 0.18)",
        };
      }

      return {
        accent: "#dc2626",
        accentSoft: "rgba(239, 68, 68, 0.18)",
        border: "rgba(220, 38, 38, 0.45)",
        text: "#0f172a",
        value: "#b91c1c",
        shadow: "0 14px 28px rgba(220, 38, 38, 0.2)",
      };
    case "wind":
      if (value < 7) {
        return {
          accent: "#16a34a",
          accentSoft: "rgba(34, 197, 94, 0.18)",
          border: "rgba(22, 163, 74, 0.42)",
          text: "#0f172a",
          value: "#15803d",
          shadow: "0 14px 28px rgba(22, 163, 74, 0.18)",
        };
      }

      if (value < 13) {
        return {
          accent: "#f97316",
          accentSoft: "rgba(249, 115, 22, 0.18)",
          border: "rgba(249, 115, 22, 0.45)",
          text: "#0f172a",
          value: "#c2410c",
          shadow: "0 14px 28px rgba(249, 115, 22, 0.18)",
        };
      }

      return {
        accent: "#dc2626",
        accentSoft: "rgba(239, 68, 68, 0.18)",
        border: "rgba(220, 38, 38, 0.45)",
        text: "#0f172a",
        value: "#b91c1c",
        shadow: "0 14px 28px rgba(220, 38, 38, 0.2)",
      };
    case "precipitation":
      if (value < 2) {
        return {
          accent: "#0284c7",
          accentSoft: "rgba(14, 165, 233, 0.16)",
          border: "rgba(2, 132, 199, 0.42)",
          text: "#0f172a",
          value: "#0369a1",
          shadow: "0 14px 28px rgba(2, 132, 199, 0.16)",
        };
      }

      if (value < 8) {
        return {
          accent: "#0f766e",
          accentSoft: "rgba(13, 148, 136, 0.16)",
          border: "rgba(15, 118, 110, 0.4)",
          text: "#0f172a",
          value: "#115e59",
          shadow: "0 14px 28px rgba(15, 118, 110, 0.16)",
        };
      }

      return {
        accent: "#1d4ed8",
        accentSoft: "rgba(59, 130, 246, 0.18)",
        border: "rgba(29, 78, 216, 0.42)",
        text: "#0f172a",
        value: "#1e3a8a",
        shadow: "0 14px 28px rgba(29, 78, 216, 0.18)",
      };
    case "humidity":
      if (value < 45) {
        return {
          accent: "#06b6d4",
          accentSoft: "rgba(34, 211, 238, 0.18)",
          border: "rgba(6, 182, 212, 0.4)",
          text: "#0f172a",
          value: "#0e7490",
          shadow: "0 14px 28px rgba(6, 182, 212, 0.16)",
        };
      }

      if (value < 75) {
        return {
          accent: "#0ea5e9",
          accentSoft: "rgba(14, 165, 233, 0.16)",
          border: "rgba(14, 165, 233, 0.4)",
          text: "#0f172a",
          value: "#0369a1",
          shadow: "0 14px 28px rgba(14, 165, 233, 0.16)",
        };
      }

      return {
        accent: "#2563eb",
        accentSoft: "rgba(59, 130, 246, 0.18)",
        border: "rgba(37, 99, 235, 0.42)",
        text: "#0f172a",
        value: "#1d4ed8",
        shadow: "0 14px 28px rgba(37, 99, 235, 0.18)",
      };
    case "pressure":
      if (value < 1004) {
        return {
          accent: "#f59e0b",
          accentSoft: "rgba(245, 158, 11, 0.18)",
          border: "rgba(245, 158, 11, 0.44)",
          text: "#0f172a",
          value: "#b45309",
          shadow: "0 14px 28px rgba(245, 158, 11, 0.18)",
        };
      }

      if (value < 1016) {
        return {
          accent: "#6366f1",
          accentSoft: "rgba(99, 102, 241, 0.18)",
          border: "rgba(99, 102, 241, 0.42)",
          text: "#0f172a",
          value: "#4338ca",
          shadow: "0 14px 28px rgba(99, 102, 241, 0.18)",
        };
      }

      return {
        accent: "#0f766e",
        accentSoft: "rgba(13, 148, 136, 0.18)",
        border: "rgba(15, 118, 110, 0.42)",
        text: "#0f172a",
        value: "#115e59",
        shadow: "0 14px 28px rgba(15, 118, 110, 0.16)",
      };
    default:
      return {
        accent: "#6b7280",
        accentSoft: "rgba(148, 163, 184, 0.2)",
        border: "rgba(148, 163, 184, 0.45)",
        text: "#0f172a",
        value: "#334155",
        shadow: "0 14px 30px rgba(15, 23, 42, 0.14)",
      };
  }
}

function getWeatherModeMarkerIconSvg(mode: WeatherMarkerKind): string {
  switch (mode) {
    case "temperature":
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:15px;height:15px;display:block;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round">
          <path d="M10.5 6.5a1.5 1.5 0 0 1 3 0v8.1a4.5 4.5 0 1 1-3 0z" />
          <path d="M12 6.5v8.5" />
          <circle cx="12" cy="18.2" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      `;
    case "wind":
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:15px;height:15px;display:block;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round">
          <path d="M3 8h10.2c1.8 0 3.3-1.4 3.3-3.1S15 1.8 13.2 1.8c-1.4 0-2.6.8-3.1 2" />
          <path d="M3 12h14.8c1.6 0 2.9 1.2 2.9 2.7 0 1.6-1.3 2.8-2.9 2.8H10.8" />
          <path d="M3 16.5h7.3c1.5 0 2.7 1.1 2.7 2.5s-1.2 2.5-2.7 2.5" />
        </svg>
      `;
    case "precipitation":
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:15px;height:15px;display:block;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round">
          <path d="M7 17.5a5.5 5.5 0 1 1 1.2-10.8A7 7 0 0 1 20 9.3a4.5 4.5 0 0 1-1.4 8.2H7z" />
          <path d="M8.3 19.1v2.4" />
          <path d="M12 19.1v2.4" />
          <path d="M15.7 19.1v2.4" />
        </svg>
      `;
    case "humidity":
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:15px;height:15px;display:block;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round">
          <path d="M12 2.8C8.6 6.8 6.2 10 6.2 13.4a5.8 5.8 0 1 0 11.6 0c0-3.4-2.4-6.6-5.8-10.6z" />
          <path d="M9.5 14.4a2.9 2.9 0 0 0 5 1.9" />
        </svg>
      `;
    case "pressure":
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:15px;height:15px;display:block;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 12l4.6-3.2" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <path d="M12 5.6v1.4M7.8 7.8l1 1M5.6 12h1.4M17 12h1.4M15.2 7.8l1-1" />
        </svg>
      `;
  }
}

function getWeatherStateMarkerMetrics(mapZoom: number, selected: boolean): WeatherStateMarkerMetrics {
  const scale = mapZoom >= 7.2 ? 1 : mapZoom >= 6.2 ? 0.92 : 0.84;
  const size = Math.max(18, Math.round((selected ? 24 : 22) * scale));
  const dotSize = Math.max(6, Math.round(8 * scale));

  return {
    size,
    dotSize,
    anchorY: Math.round(size * 0.72),
    tooltipOffsetY: -Math.max(8, Math.round(size * 0.44)),
  };
}

function getWeatherCityMarkerMetrics(mapZoom: number, selected: boolean): WeatherCityMarkerMetrics {
  const scale = mapZoom >= 8.2 ? 1 : mapZoom >= 7.4 ? 0.84 : mapZoom >= 6.6 ? 0.72 : 0.6;
  const width = Math.max(34, Math.round((selected ? 72 : 62) * scale));
  const badgeHeight = Math.max(20, Math.round((selected ? 32 : 28) * scale));
  const offsetY = mapZoom >= 8.2 ? 14 : mapZoom >= 7.4 ? 16 : mapZoom >= 6.6 ? 18 : 20;

  return {
    width,
    height: badgeHeight + offsetY,
    badgeHeight,
    fontSize: Math.max(8, Math.round((selected ? 11 : 10) * scale)),
    windBadgeSize: Math.max(10, Math.round((selected ? 16 : 14) * scale)),
    gap: Math.max(3, Math.round(4 * scale)),
    paddingX: Math.max(7, Math.round((selected ? 11 : 9) * scale)),
    borderRadius: Math.max(999, Math.round(999 * scale)),
    offsetY,
  };
}

function WeatherStateMarkerLayer({
  stateViews,
  activeStateKey,
  animationSeed,
  mapZoom,
  onSelectState,
}: {
  stateViews: WeatherStateView[];
  activeStateKey: string;
  animationSeed: WeatherMode;
  mapZoom: number;
  onSelectState: (state: WeatherStateView) => void;
}) {
  const visibleStates = useMemo(() => {
    const sortedStates = [...stateViews].sort(compareWeatherStateVisibility);
    const selectedState = activeStateKey
      ? sortedStates.find((state) => state.stateKey === activeStateKey) ?? null
      : null;
    const pinnedNorthernStates = sortedStates.filter((state) => NORTHERN_OVERVIEW_STATE_KEYS.has(state.stateKey));

    if (selectedState && mapZoom >= 6.8) {
      return [selectedState];
    }

    const limit = getWeatherStateVisibilityLimit(mapZoom);
    const limitedStates = Number.isFinite(limit) ? sortedStates.slice(0, limit) : sortedStates;
    const overviewStates = mergeWeatherStateViews(limitedStates, pinnedNorthernStates);

    if (!selectedState) {
      return overviewStates;
    }

    if (overviewStates.some((state) => state.stateKey === selectedState.stateKey)) {
      return overviewStates;
    }

    return mergeWeatherStateViews(overviewStates, [selectedState]).sort(compareWeatherStateVisibility);
  }, [activeStateKey, mapZoom, stateViews]);

  return (
    <>
      {visibleStates.map((state) => (
        <WeatherStateMarker
          key={`${state.stateKey}:${animationSeed}`}
          state={state}
          mapZoom={mapZoom}
          selected={state.stateKey === activeStateKey}
          onSelect={() => onSelectState(state)}
        />
      ))}
    </>
  );
}

function WeatherStateMarker({
  state,
  mapZoom,
  selected,
  onSelect,
}: {
  state: WeatherStateView;
  mapZoom: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const metrics = useMemo(
    () => getWeatherStateMarkerMetrics(mapZoom, selected),
    [mapZoom, selected],
  );

  const icon = useMemo(() => {
    return L.divIcon({
      className: "",
      iconSize: [metrics.size, metrics.size],
      iconAnchor: [metrics.size / 2, metrics.anchorY],
      html: `
        <div
          class="wx-state-pin ${selected ? "wx-state-pin--selected" : ""}"
          style="
            width:${metrics.size}px;
            height:${metrics.size}px;
            animation:weatherMarkerFadeIn 240ms ease both;
            transform-origin:center bottom;
            will-change:transform, opacity;
          "
        >
          <span
            class="wx-state-pin__dot"
            style="
              width:${metrics.dotSize}px;
              height:${metrics.dotSize}px;
              animation:weatherMarkerDotPulse ${selected ? "2.8s" : "3.4s"} ease-in-out infinite;
              animation-delay:220ms;
              will-change:transform, opacity;
            "
          ></span>
        </div>
      `,
    });
  }, [metrics.anchorY, metrics.dotSize, metrics.size, selected]);

  return (
    <Marker
      position={state.center}
      icon={icon}
      eventHandlers={{
        click: (event) => {
          event.originalEvent?.stopPropagation();
          onSelect();
        },
      }}
    >
      <Tooltip direction="top" offset={[0, metrics.tooltipOffsetY]} opacity={1} sticky className="wx-state-tooltip-shell">
        <span className="wx-state-tooltip">{state.state}</span>
      </Tooltip>
    </Marker>
  );
}

function WeatherCityLayer({
  stateView,
  activeMode,
  mapZoom,
  selectedCityKey,
  onSelectCity,
  onInspectCity,
}: {
  stateView: WeatherStateView;
  activeMode: WeatherMode;
  mapZoom: number;
  selectedCityKey: string | null;
  onSelectCity: (city: WeatherStateView["cities"][number]) => void;
  onInspectCity: (city: WeatherStateView["cities"][number]) => void;
}) {
  const visibleCities = useMemo(() => {
    const sortedCities = [...stateView.cities].sort(compareWeatherCityVisibility);
    const limit = getWeatherCityVisibilityLimit(mapZoom);
    const limitedCities = Number.isFinite(limit) ? sortedCities.slice(0, limit) : sortedCities;

    if (!selectedCityKey) {
      return limitedCities;
    }

    const selectedCity = sortedCities.find((city) => city.key === selectedCityKey);
    if (!selectedCity) {
      return limitedCities;
    }

    if (limitedCities.some((city) => city.key === selectedCity.key)) {
      return limitedCities;
    }

    return [...limitedCities, selectedCity].sort(compareWeatherCityVisibility);
  }, [mapZoom, selectedCityKey, stateView.cities]);

  return (
    <>
      {visibleCities.map((city) => (
        <WeatherCityMarker
          key={`${city.id}:${activeMode}`}
          city={city}
          activeMode={activeMode}
          mapZoom={mapZoom}
          selected={selectedCityKey === city.key}
          onInspect={() => onInspectCity(city)}
          onSelect={() => onSelectCity(city)}
        />
      ))}
    </>
  );
}

function compareWeatherCityVisibility(
  a: WeatherStateView["cities"][number],
  b: WeatherStateView["cities"][number],
): number {
  const priorityDiff = getWeatherCityPriority(a) - getWeatherCityPriority(b);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const weatherDiff = Number(b.weather ? 1 : 0) - Number(a.weather ? 1 : 0);
  if (weatherDiff !== 0) {
    return weatherDiff;
  }

  return a.name.localeCompare(b.name);
}

function compareWeatherStateVisibility(a: WeatherStateView, b: WeatherStateView): number {
  const weatherCoverageDiff = b.weatherCityCount - a.weatherCityCount;
  if (weatherCoverageDiff !== 0) {
    return weatherCoverageDiff;
  }

  const cityCountDiff = b.cityCount - a.cityCount;
  if (cityCountDiff !== 0) {
    return cityCountDiff;
  }

  return a.state.localeCompare(b.state);
}

function mergeWeatherStateViews(
  primary: WeatherStateView[],
  secondary: WeatherStateView[],
): WeatherStateView[] {
  const merged = new Map<string, WeatherStateView>();

  for (const state of primary) {
    merged.set(state.stateKey, state);
  }

  for (const state of secondary) {
    if (!merged.has(state.stateKey)) {
      merged.set(state.stateKey, state);
    }
  }

  return Array.from(merged.values()).sort(compareWeatherStateVisibility);
}

function getWeatherStateVisibilityLimit(zoom: number): number {
  if (zoom >= 6.8) {
    return Number.POSITIVE_INFINITY;
  }

  if (zoom >= 6.2) {
    return 22;
  }

  if (zoom >= 5.7) {
    return 18;
  }

  return 14;
}

function getWeatherCityPriority(city: WeatherStateView["cities"][number]): number {
  return WEATHER_MAJOR_CITY_NAMES.has(city.name.toLowerCase()) ? 0 : 1;
}

function getWeatherCityVisibilityLimit(zoom: number): number {
  if (zoom >= 8.4) {
    return Number.POSITIVE_INFINITY;
  }

  if (zoom >= 7.8) {
    return 16;
  }

  if (zoom >= 7.2) {
    return 10;
  }

  if (zoom >= 6.6) {
    return 6;
  }

  if (zoom >= 6.1) {
    return 3;
  }

  return 2;
}

function WeatherCityMarker({
  city,
  activeMode,
  mapZoom,
  selected,
  onInspect,
  onSelect,
}: {
  city: WeatherStateView["cities"][number];
  activeMode: WeatherMode;
  mapZoom: number;
  selected: boolean;
  onInspect: () => void;
  onSelect: () => void;
}) {
  if (activeMode === "none") {
    return null;
  }

  const metrics = useMemo(
    () => getWeatherCityMarkerMetrics(mapZoom, selected),
    [mapZoom, selected],
  );

  const icon = useMemo(() => {
    const tone = getWeatherMarkerTone(activeMode, city.value, Boolean(city.weather));
    const markerIconSvg = getWeatherModeMarkerIconSvg("wind");
    const showWindBadge = Boolean(city.weather) && (selected || mapZoom >= 7.6);
    const temperatureLabel = city.weather
      ? `${Math.round(city.weather.data.temperature)}&deg;C`
      : "Unavailable";

    return L.divIcon({
      className: "",
      iconSize: [metrics.width, metrics.height],
      iconAnchor: [metrics.width / 2, metrics.height + 2],
      html: `
        <div
          class="wx-city-badge-wrap ${selected ? "wx-city-badge-wrap--selected" : ""}"
          style="
            width:${metrics.width}px;
            height:${metrics.height}px;
            position:relative;
            display:flex;
            align-items:flex-start;
            justify-content:flex-start;
            pointer-events:auto;
            animation:weatherMarkerFadeIn 260ms ease both;
            transform-origin:center bottom;
            will-change:transform, opacity;
          "
        >
          <div
            class="wx-city-badge ${selected ? "wx-city-badge--selected" : ""}"
            style="
              min-width:${metrics.width}px;
              height:${metrics.badgeHeight}px;
              display:flex;
              align-items:center;
              justify-content:${showWindBadge ? "space-between" : "center"};
              gap:${metrics.gap}px;
              margin-top:0;
              padding:0 ${metrics.paddingX}px;
              border-radius:${metrics.borderRadius}px;
              background:linear-gradient(180deg, rgba(255,255,255,0.96), rgba(239, 246, 255, 0.92));
              border:1px solid ${tone.border};
              box-shadow:${selected ? `0 14px 26px rgba(15, 23, 42, 0.14), ${tone.shadow}` : `0 10px 22px rgba(15, 23, 42, 0.1), ${tone.shadow}`};
              color:${tone.text};
              backdrop-filter:blur(10px);
              -webkit-backdrop-filter:blur(10px);
              animation:weatherMarkerPulse ${selected ? "2.8s" : "3.5s"} ease-in-out infinite;
              animation-delay:240ms;
              will-change:transform, filter;
            "
          >
            <span
              class="wx-city-badge__temp"
              style="
              font-size:${metrics.fontSize}px;
              line-height:1;
              font-weight:800;
              letter-spacing:0.02em;
              color:${tone.value};
              text-align:center;
              white-space:nowrap;
            "
            >${temperatureLabel}</span>
            ${showWindBadge
          ? `
            <span
              class="wx-city-badge__wind"
              style="
                width:${metrics.windBadgeSize}px;
                height:${metrics.windBadgeSize}px;
                flex-shrink:0;
                display:grid;
                place-items:center;
                border-radius:999px;
                background:${tone.accentSoft};
                color:${tone.accent};
                box-shadow:inset 0 0 0 1px rgba(255,255,255,0.84);
              "
            >${markerIconSvg}</span>`
          : ""
        }
          </div>
        </div>
      `,
    });
  }, [activeMode, city.weather, city.value, mapZoom, metrics, selected]);

  const popupModeValue = formatWeatherValue(activeMode, city.value);
  const hoverTemperature = city.weather ? `${Math.round(city.weather.data.temperature)}°C` : "Unavailable";
  const hoverWind = city.weather ? `${city.weather.data.wind_speed.toFixed(1)} m/s` : "Unavailable";
  const hoverHumidity = city.weather ? `${Math.round(city.weather.data.humidity)}%` : "Unavailable";

  return (
    <Marker
      position={[city.latitude, city.longitude]}
      icon={icon}
      eventHandlers={{
        click: (event) => {
          event.originalEvent?.stopPropagation();
          onSelect();
          onInspect();
        },
      }}
    >
      <Tooltip
        direction="top"
        offset={[0, -(metrics.height + 10)]}
        opacity={1}
        sticky
        className="wx-weather-tooltip-shell"
      >
        <div className="wx-weather-tooltip">
          <div className="wx-weather-tooltip__title">{city.name}</div>
          <div className="wx-weather-tooltip__grid">
            <span>Temperature</span>
            <strong>{hoverTemperature}</strong>
            <span>Wind</span>
            <strong>{hoverWind}</strong>
            <span>Humidity</span>
            <strong>{hoverHumidity}</strong>
          </div>
        </div>
      </Tooltip>
      <Popup className="wx-search-popup-shell" closeButton={false}>
        <div className="wx-search-popup wx-city-popup">
          <div className="wx-search-popup__header">{city.state ?? "Weather City"}</div>
          <div className="wx-search-popup__value">{city.name}</div>
          <div className="wx-search-popup__subvalue">{popupModeValue}</div>
          <div className="wx-search-popup__meta">
            {city.weather?.data.condition ?? "Unavailable"} | {city.weather ? `${city.weather.data.wind_speed.toFixed(1)} m/s wind` : "Data unavailable"}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
