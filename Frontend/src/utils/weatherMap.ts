import { getWeatherColorRamp, getWeatherModeValue } from "./mapHelpers";
import { INDIA_LOCATIONS } from "./indiaLocations";
import { INDIA_CSV_CITY_LOCATIONS } from "./indiaCities";
import { distanceKm } from "./indiaAirports";
import type { WeatherAlertLevel, WeatherCell, WeatherMode } from "../types";

export type WeatherPlace = {
  id: string;
  name: string;
  kind: "state" | "capital" | "region";
  state?: string;
  latitude: number;
  longitude: number;
  aliases?: string[];
};

export type WeatherStateBase = {
  state: string;
  stateKey: string;
  cities: WeatherPlace[];
  polygon: Array<[number, number]>;
  bounds: [[number, number], [number, number]];
  center: [number, number];
};

export type WeatherConditionBucket = "clear" | "cloud" | "rain" | "storm" | "snow" | "fog" | "wind" | "default";
type WeatherStateViewportOverride = {
  bounds: [[number, number], [number, number]];
  center: [number, number];
};

const STATE_ALIASES: Record<string, string> = {
  nct: "delhi",
  "delhi-nct": "delhi",
  "nct-of-delhi": "delhi",
  "national-capital-territory": "delhi",
  "national-capital-territory-of-delhi": "delhi",
  jk: "jammu-and-kashmir",
  jandk: "jammu-and-kashmir",
  "jammu-kashmir": "jammu-and-kashmir",
  "jammu-and-kashmir": "jammu-and-kashmir",
  "andaman-and-nicobar": "andaman-and-nicobar-islands",
  "andaman-and-nicobar-islands": "andaman-and-nicobar-islands",
  "dadra-and-nagar-haveli-and-daman-and-diu": "dadra-and-nagar-haveli-and-daman-and-diu",
  "uttaranchal": "uttarakhand",
};

const STATE_VIEWPORT_OVERRIDES: Partial<Record<string, WeatherStateViewportOverride>> = {
  // Sparse northern states need a curated viewport so India's Himalayan belt
  // is not visually cropped down to one city marker.
  "himachal-pradesh": {
    bounds: [[30.35, 75.55], [33.25, 79.1]],
    center: [31.78, 77.18],
  },
  "jammu-and-kashmir": {
    bounds: [[32.05, 73.85], [35.15, 77.05]],
    center: [33.84, 75.2],
  },
  ladakh: {
    bounds: [[32.95, 75.8], [36.98, 79.95]],
    center: [34.9, 77.7],
  },
};

const WEATHER_PLACES: WeatherPlace[] = [
  ...INDIA_LOCATIONS,
  ...INDIA_CSV_CITY_LOCATIONS.map((city) => ({
    id: city.id,
    name: city.name,
    kind: "region" as const,
    state: city.state,
    latitude: city.latitude,
    longitude: city.longitude,
  })),
];

export const WEATHER_STATE_BASES: WeatherStateBase[] = buildWeatherStateBases();

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeStateKey(value: string | undefined): string {
  const normalized = normalizeText(value);
  return STATE_ALIASES[normalized] ?? normalized;
}

export function getWeatherPlaceKey(place: Pick<WeatherPlace, "name" | "state">): string {
  return `${normalizeText(place.name)}:${normalizeStateKey(place.state ?? place.name)}`;
}

function placeSearchText(place: WeatherPlace): string {
  return [
    place.name,
    place.kind,
    place.state ?? "",
    ...(place.aliases ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function buildWeatherStateBases(): WeatherStateBase[] {
  const groupedCities = new Map<string, WeatherPlace[]>();
  const stateAnchors = new Map<string, WeatherPlace[]>();

  for (const place of INDIA_CSV_CITY_LOCATIONS) {
    const key = normalizeStateKey(place.state);
    const entry = groupedCities.get(key);
    if (entry) {
      entry.push({
        id: place.id,
        name: place.name,
        kind: "region",
        state: place.state,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    } else {
      groupedCities.set(key, [
        {
          id: place.id,
          name: place.name,
          kind: "region",
          state: place.state,
          latitude: place.latitude,
          longitude: place.longitude,
        },
      ]);
    }
  }

  for (const place of INDIA_LOCATIONS) {
    if (place.kind !== "state" && place.kind !== "capital") {
      continue;
    }

    const key = normalizeStateKey(place.kind === "state" ? place.name : place.state);
    if (!key) {
      continue;
    }

    const entry = stateAnchors.get(key);
    if (entry) {
      entry.push(place);
    } else {
      stateAnchors.set(key, [place]);
    }
  }

  const allStateKeys = new Set<string>([
    ...groupedCities.keys(),
    ...stateAnchors.keys(),
  ]);

  return Array.from(allStateKeys)
    .map((stateKey) => {
      const cities = groupedCities.get(stateKey) ?? [];
      const anchors = stateAnchors.get(stateKey) ?? [];
      const displayState =
        cities[0]?.state ??
        anchors.find((place) => place.kind === "state")?.name ??
        anchors[0]?.state ??
        stateKey;
      const fallbackCities = anchors.filter((place) => place.kind !== "state");
      const displayCities = cities.length > 0 ? cities : fallbackCities;
      const geometryPoints: Array<[number, number]> = [...cities, ...anchors].map((place) => [
        place.latitude,
        place.longitude,
      ]);
      const viewportOverride = STATE_VIEWPORT_OVERRIDES[stateKey];
      const geometry = viewportOverride
        ? createViewportGeometry(viewportOverride)
        : buildStateEnvelope(geometryPoints);

      return {
        state: displayState,
        stateKey,
        cities: displayCities.slice().sort((a, b) => a.name.localeCompare(b.name)),
        polygon: geometry.polygon,
        bounds: geometry.bounds,
        center: geometry.center,
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state));
}

function createViewportGeometry(viewport: WeatherStateViewportOverride): {
  polygon: Array<[number, number]>;
  bounds: [[number, number], [number, number]];
  center: [number, number];
} {
  return {
    polygon: paddedRectangle(viewport.bounds, 0),
    bounds: viewport.bounds,
    center: viewport.center,
  };
}

function buildStateEnvelope(points: Array<[number, number]>): {
  polygon: Array<[number, number]>;
  bounds: [[number, number], [number, number]];
  center: [number, number];
} {
  if (points.length === 0) {
    return {
      polygon: [],
      bounds: [[0, 0], [0, 0]],
      center: [0, 0],
    };
  }

  const center = averagePoint(points);
  const bounds = boundsFromPoints(points);

  if (points.length < 3) {
    return {
      polygon: paddedRectangle(bounds, 0.45),
      bounds: padBounds(bounds, 0.45),
      center,
    };
  }

  const hull = convexHull(points);
  if (hull.length >= 3) {
    return {
      polygon: hull,
      bounds,
      center,
    };
  }

  return {
    polygon: paddedRectangle(bounds, 0.35),
    bounds: padBounds(bounds, 0.35),
    center,
  };
}

function boundsFromPoints(points: Array<[number, number]>): [[number, number], [number, number]] {
  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLon = points[0][1];
  let maxLon = points[0][1];

  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  return [[minLat, minLon], [maxLat, maxLon]];
}

function padBounds(bounds: [[number, number], [number, number]], padding: number): [[number, number], [number, number]] {
  const [[minLat, minLon], [maxLat, maxLon]] = bounds;
  return [
    [minLat - padding, minLon - padding],
    [maxLat + padding, maxLon + padding],
  ];
}

function paddedRectangle(bounds: [[number, number], [number, number]], padding: number): Array<[number, number]> {
  const [[minLat, minLon], [maxLat, maxLon]] = padBounds(bounds, padding);
  return [
    [minLat, minLon],
    [minLat, maxLon],
    [maxLat, maxLon],
    [maxLat, minLon],
  ];
}

function averagePoint(points: Array<[number, number]>): [number, number] {
  const total = points.reduce(
    (acc, [lat, lon]) => {
      acc.lat += lat;
      acc.lon += lon;
      return acc;
    },
    { lat: 0, lon: 0 },
  );
  return [total.lat / points.length, total.lon / points.length];
}

function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length <= 3) {
    return points.slice();
  }

  const sorted = [...points].sort((a, b) => {
    if (a[1] === b[1]) return a[0] - b[0];
    return a[1] - b[1];
  });

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);

  const lower: Array<[number, number]> = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  upper.pop();
  lower.pop();

  return lower.concat(upper);
}

export function searchWeatherPlaces(query: string, limit = 8): WeatherPlace[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];

  const deduped: WeatherPlace[] = [];
  const seen = new Set<string>();

  for (const place of WEATHER_PLACES
    .filter((candidate) => placeSearchText(candidate).includes(normalized))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(normalized) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(normalized) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.kind !== b.kind) return weatherPlaceKindPriority(a.kind) - weatherPlaceKindPriority(b.kind);
      return a.name.localeCompare(b.name);
    })) {
    const key = getWeatherPlaceKey(place);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(place);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

function weatherPlaceKindPriority(kind: WeatherPlace["kind"]): number {
  if (kind === "state") return 0;
  if (kind === "capital") return 1;
  return 2;
}

export function getNearestWeatherCell(
  cells: WeatherCell[],
  latitude: number,
  longitude: number,
): WeatherCell | null {
  if (cells.length === 0) return null;

  return cells.reduce<WeatherCell | null>((best, cell) => {
    if (!best) return cell;
    const currentDistance = distanceKm(latitude, longitude, cell.data.latitude, cell.data.longitude);
    const bestDistance = distanceKm(latitude, longitude, best.data.latitude, best.data.longitude);
    return currentDistance < bestDistance ? cell : best;
  }, null);
}

export function getNearestWeatherPlace(
  latitude: number,
  longitude: number,
  maxDistanceKm = 90,
): WeatherPlace | null {
  if (WEATHER_PLACES.length === 0) {
    return null;
  }

  let nearestPlace: WeatherPlace | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const place of WEATHER_PLACES) {
    const currentDistance = distanceKm(latitude, longitude, place.latitude, place.longitude);
    if (currentDistance < nearestDistance) {
      nearestPlace = place;
      nearestDistance = currentDistance;
    }
  }

  if (!nearestPlace || nearestDistance > maxDistanceKm) {
    return null;
  }

  return nearestPlace;
}

export function getWeatherAlertLevel(cellOrWindSpeed: WeatherCell | number): WeatherAlertLevel | null {
  const windSpeed =
    typeof cellOrWindSpeed === "number"
      ? cellOrWindSpeed
      : cellOrWindSpeed.data.wind_speed;

  if (!Number.isFinite(windSpeed)) {
    return null;
  }

  if (windSpeed > 15) {
    return "red";
  }

  if (windSpeed > 8) {
    return "orange";
  }

  return "yellow";
}

export function formatWeatherValue(mode: WeatherMode, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }

  switch (mode) {
    case "temperature":
      return `${Math.round(value)}°C`;
    case "wind":
      return `${Math.round(value)} m/s`;
    case "humidity":
      return `${Math.round(value)}%`;
    case "pressure":
      return `${Math.round(value)} hPa`;
    case "precipitation":
      return `${value.toFixed(1)} mm`;
    default:
      return `${Math.round(value)}`;
  }
}

export function getWeatherModeColor(mode: WeatherMode, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "#64748b";
  }

  const ramp = getWeatherColorRamp(mode);
  if (ramp.length === 0) {
    return "#0d5c86";
  }

  let chosen = ramp[0][1];
  for (const [threshold, color] of ramp) {
    if (value >= threshold) {
      chosen = color;
    } else {
      break;
    }
  }

  if (chosen === "rgba(0,0,0,0)" || chosen === "rgba(255,255,255,0)" || chosen === "transparent") {
    return "#0d5c86";
  }

  return chosen;
}

export function getWeatherConditionBucket(condition: string): WeatherConditionBucket {
  const normalized = condition.toLowerCase();
  if (normalized.includes("thunder") || normalized.includes("storm")) return "storm";
  if (normalized.includes("snow") || normalized.includes("sleet") || normalized.includes("hail")) return "snow";
  if (normalized.includes("rain") || normalized.includes("drizzle") || normalized.includes("shower")) return "rain";
  if (normalized.includes("fog") || normalized.includes("mist") || normalized.includes("haze")) return "fog";
  if (normalized.includes("cloud") || normalized.includes("overcast")) return "cloud";
  if (normalized.includes("wind")) return "wind";
  if (normalized.includes("clear") || normalized.includes("sun")) return "clear";
  return "default";
}

export function getWeatherConditionGlyph(condition: string | null | undefined): { glyph: string; label: string; bucket: WeatherConditionBucket } | null {
  if (!condition) {
    return null;
  }

  const bucket = getWeatherConditionBucket(condition);

  switch (bucket) {
    case "clear":
      return { glyph: "SUN", label: "Clear sky", bucket };
    case "cloud":
      return { glyph: "CLD", label: "Cloud cover", bucket };
    case "rain":
      return { glyph: "RAN", label: "Rain", bucket };
    case "storm":
      return { glyph: "STM", label: "Storm", bucket };
    case "snow":
      return { glyph: "SNW", label: "Snow", bucket };
    case "fog":
      return { glyph: "FOG", label: "Fog", bucket };
    case "wind":
      return { glyph: "WND", label: "Wind", bucket };
    default:
      return { glyph: "WX", label: "Weather", bucket };
  }
}

export function getWeatherGlyphTone(bucket: WeatherConditionBucket): WeatherConditionBucket {
  switch (bucket) {
    case "clear":
      return "clear";
    case "cloud":
      return "cloud";
    case "rain":
      return "rain";
    case "storm":
      return "storm";
    case "snow":
      return "snow";
    case "fog":
      return "fog";
    case "wind":
      return "wind";
    default:
      return "default";
  }
}

export function getWeatherCellModeValue(cell: WeatherCell, mode: WeatherMode): number | null {
  return getWeatherModeValue(cell, mode);
}
