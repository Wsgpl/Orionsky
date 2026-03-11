import type {
  MissionCoordinate,
  MissionGeometry,
  MissionGeometryMetadata,
  MissionLineStringGeometry,
  MissionPolygonGeometry,
} from "../types";

const EARTH_RADIUS_KM = 6371;
const COORDINATE_TOLERANCE = 0.000001;

export type MissionGeometrySummary = {
  coordinateCount: number;
  totalDistanceKm: number;
  segmentDistancesKm: number[];
  areaSqKm: number;
  isClosed: boolean;
};

export type MissionGeometrySegment = {
  id: string;
  start: MissionCoordinate;
  end: MissionCoordinate;
  afterIndex: number;
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function isFiniteCoordinatePart(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidMissionCoordinate(
  value: MissionCoordinate | null | undefined,
): value is MissionCoordinate {
  return Boolean(
    value &&
      isFiniteCoordinatePart(value.lat) &&
      isFiniteCoordinatePart(value.lon) &&
      value.lat >= -90 &&
      value.lat <= 90 &&
      value.lon >= -180 &&
      value.lon <= 180,
  );
}

export function normalizeMissionCoordinate(
  value: MissionCoordinate | null | undefined,
): MissionCoordinate | null {
  if (!isValidMissionCoordinate(value)) {
    return null;
  }

  return {
    lat: value.lat,
    lon: value.lon,
    alt: isFiniteCoordinatePart(value.alt) ? value.alt : undefined,
  };
}

export function missionCoordinatesEqual(a: MissionCoordinate, b: MissionCoordinate): boolean {
  return Math.abs(a.lat - b.lat) < COORDINATE_TOLERANCE && Math.abs(a.lon - b.lon) < COORDINATE_TOLERANCE;
}

export function normalizeMissionCoordinates(coordinates: MissionCoordinate[]): MissionCoordinate[] {
  const normalized: MissionCoordinate[] = [];

  coordinates.forEach((coordinate) => {
    const next = normalizeMissionCoordinate(coordinate);
    if (!next) {
      return;
    }

    if (normalized.length === 0 || !missionCoordinatesEqual(normalized[normalized.length - 1], next)) {
      normalized.push(next);
    }
  });

  return normalized;
}

export function buildMissionGeometrySegments(
  coordinates: MissionCoordinate[],
  options: {
    closed?: boolean;
  } = {},
): MissionGeometrySegment[] {
  const normalized = normalizeMissionCoordinates(coordinates);
  const closed = options.closed ?? false;
  const baseCoordinates =
    closed && normalized.length >= 2 && missionCoordinatesEqual(normalized[0], normalized[normalized.length - 1])
      ? normalized.slice(0, -1)
      : normalized;

  if (baseCoordinates.length < 2) {
    return [];
  }

  const segments: MissionGeometrySegment[] = [];
  const limit = closed ? baseCoordinates.length : baseCoordinates.length - 1;

  for (let index = 0; index < limit; index += 1) {
    const start = baseCoordinates[index];
    const end = closed
      ? baseCoordinates[(index + 1) % baseCoordinates.length]
      : baseCoordinates[index + 1];

    if (!end) {
      continue;
    }

    segments.push({
      id: `segment-${index}-${(index + 1) % baseCoordinates.length}`,
      start,
      end,
      afterIndex: index,
    });
  }

  return segments;
}

export function ensurePolygonClosed(coordinates: MissionCoordinate[]): MissionCoordinate[] {
  const normalized = normalizeMissionCoordinates(coordinates);
  if (normalized.length < 3) {
    return normalized;
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (missionCoordinatesEqual(first, last)) {
    return normalized;
  }

  return [...normalized, { lat: first.lat, lon: first.lon, alt: first.alt }];
}

export function calculateDistanceKm(a: MissionCoordinate, b: MissionCoordinate): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return EARTH_RADIUS_KM * arc;
}

export function calculateLineStringDistanceKm(coordinates: MissionCoordinate[]): number {
  const normalized = normalizeMissionCoordinates(coordinates);
  if (normalized.length < 2) {
    return 0;
  }

  let distanceKm = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    distanceKm += calculateDistanceKm(normalized[index - 1], normalized[index]);
  }
  return distanceKm;
}

export function calculatePolygonAreaSqKm(coordinates: MissionCoordinate[]): number {
  const closedRing = ensurePolygonClosed(coordinates);
  if (closedRing.length < 4) {
    return 0;
  }

  const referenceLatitude = toRadians(
    closedRing.slice(0, -1).reduce((sum, coordinate) => sum + coordinate.lat, 0) /
      Math.max(closedRing.length - 1, 1),
  );

  const projected = closedRing.map((coordinate) => ({
    x: EARTH_RADIUS_KM * toRadians(coordinate.lon) * Math.cos(referenceLatitude),
    y: EARTH_RADIUS_KM * toRadians(coordinate.lat),
  }));

  let area = 0;
  for (let index = 0; index < projected.length - 1; index += 1) {
    const current = projected[index];
    const next = projected[index + 1];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) / 2;
}

export function buildLineStringGeometry(
  coordinates: MissionCoordinate[],
  options: {
    name?: string | null;
    metadata?: MissionGeometryMetadata | null;
  } = {},
): MissionLineStringGeometry | null {
  const normalized = normalizeMissionCoordinates(coordinates);
  if (normalized.length < 2) {
    return null;
  }

  return {
    type: "LineString",
    name: options.name ?? null,
    coordinates: normalized,
    metadata: options.metadata ?? null,
  };
}

export function buildPolygonGeometry(
  coordinates: MissionCoordinate[],
  options: {
    name?: string | null;
    metadata?: MissionGeometryMetadata | null;
  } = {},
): MissionPolygonGeometry | null {
  const normalized = ensurePolygonClosed(coordinates);
  if (normalized.length < 4) {
    return null;
  }

  return {
    type: "Polygon",
    name: options.name ?? null,
    coordinates: normalized,
    metadata: options.metadata ?? null,
  };
}

export function buildMissionGeometrySummary(geometry: MissionGeometry | null): MissionGeometrySummary {
  if (!geometry) {
    return {
      coordinateCount: 0,
      totalDistanceKm: 0,
      segmentDistancesKm: [],
      areaSqKm: 0,
      isClosed: false,
    };
  }

  const normalized =
    geometry.type === "Polygon"
      ? ensurePolygonClosed(geometry.coordinates)
      : normalizeMissionCoordinates(geometry.coordinates);

  const segmentDistancesKm: number[] = [];
  let totalDistanceKm = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    const segmentDistanceKm = calculateDistanceKm(normalized[index - 1], normalized[index]);
    segmentDistancesKm.push(segmentDistanceKm);
    totalDistanceKm += segmentDistanceKm;
  }

  return {
    coordinateCount: normalized.length,
    totalDistanceKm,
    segmentDistancesKm,
    areaSqKm: geometry.type === "Polygon" ? calculatePolygonAreaSqKm(normalized) : 0,
    isClosed: geometry.type === "Polygon" && normalized.length >= 4,
  };
}

function interpolateCoordinate(
  start: MissionCoordinate,
  end: MissionCoordinate,
  progress: number,
): MissionCoordinate {
  return {
    lat: start.lat + (end.lat - start.lat) * progress,
    lon: start.lon + (end.lon - start.lon) * progress,
    alt:
      isFiniteCoordinatePart(start.alt) && isFiniteCoordinatePart(end.alt)
        ? start.alt + (end.alt - start.alt) * progress
        : undefined,
  };
}

export function sampleLineStringGeometry(
  geometry: MissionLineStringGeometry | null,
  spacingKm: number,
): MissionCoordinate[] {
  if (!geometry) {
    return [];
  }

  const normalized = normalizeMissionCoordinates(geometry.coordinates);
  if (normalized.length < 2 || !Number.isFinite(spacingKm) || spacingKm <= 0) {
    return normalized;
  }

  const segmentDistancesKm: number[] = [];
  const cumulativeDistances = [0];

  for (let index = 1; index < normalized.length; index += 1) {
    const segmentDistanceKm = calculateDistanceKm(normalized[index - 1], normalized[index]);
    segmentDistancesKm.push(segmentDistanceKm);
    cumulativeDistances.push(cumulativeDistances[index - 1] + segmentDistanceKm);
  }

  const totalDistanceKm = cumulativeDistances[cumulativeDistances.length - 1];
  if (totalDistanceKm <= 0) {
    return normalized;
  }

  const sampledDistances = [0];
  for (let distance = spacingKm; distance < totalDistanceKm; distance += spacingKm) {
    sampledDistances.push(distance);
  }
  if (sampledDistances[sampledDistances.length - 1] !== totalDistanceKm) {
    sampledDistances.push(totalDistanceKm);
  }

  return sampledDistances.map((targetDistance) => {
    if (targetDistance <= 0) {
      return normalized[0];
    }

    if (targetDistance >= totalDistanceKm) {
      return normalized[normalized.length - 1];
    }

    for (let index = 0; index < segmentDistancesKm.length; index += 1) {
      const segmentStartDistance = cumulativeDistances[index];
      const segmentEndDistance = cumulativeDistances[index + 1];
      if (targetDistance > segmentEndDistance) {
        continue;
      }

      const segmentDistanceKm = segmentDistancesKm[index];
      if (segmentDistanceKm <= 0) {
        return normalized[index + 1];
      }

      const progress = (targetDistance - segmentStartDistance) / segmentDistanceKm;
      return interpolateCoordinate(normalized[index], normalized[index + 1], progress);
    }

    return normalized[normalized.length - 1];
  });
}

export function toLeafletLatLngTuple(point: MissionCoordinate): [number, number] {
  return [point.lat, point.lon];
}

export function formatMissionCoordinate(point: MissionCoordinate): string {
  const altitudeSuffix = isFiniteCoordinatePart(point.alt) ? `, ${point.alt.toFixed(0)} ft` : "";
  return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}${altitudeSuffix}`;
}
