import { Aircraft, WeatherCell, WeatherMode } from "../types";

// ── GeoJSON Builders ─────────────────────────────────────────────────────────

export function buildAircraftGeoJSON(
  aircraft: Aircraft[],
  selectedIcao: string | null
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: aircraft.map((ac) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [ac.longitude, ac.latitude],
      },
      properties: {
        icao: ac.icao,
        callsign: ac.callsign ?? ac.icao,
        altitude: ac.altitude,
        velocity: ac.velocity,
        heading: ac.heading,
        on_ground: ac.on_ground ? 1 : 0,
        selected: ac.icao === selectedIcao ? 1 : 0,
        rotation: ac.heading,
      },
    })),
  };
}

export function buildWeatherHeatGeoJSON(
  cells: WeatherCell[],
  mode: WeatherMode
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [cell.data.longitude, cell.data.latitude],
      },
      properties: {
        value: extractWeatherValue(cell, mode),
        temperature: cell.data.temperature,
        wind_speed: cell.data.wind_speed,
        humidity: cell.data.humidity,
        cloud_cover: cell.data.cloud_cover,
        condition: cell.data.condition,
      },
    })),
  };
}

function extractWeatherValue(cell: WeatherCell, mode: WeatherMode): number {
  switch (mode) {
    case "temperature":   return cell.data.temperature;
    case "wind":          return cell.data.wind_speed;
    case "humidity":      return cell.data.humidity;
    case "precipitation": {
      const c = cell.data.condition.toLowerCase();
      if (c.includes("thunder") || c.includes("storm")) return 100;
      if (c.includes("heavy rain")) return 80;
      if (c.includes("rain") || c.includes("drizzle")) return 60;
      if (c.includes("overcast")) return 30;
      return 0;
    }
    default: return 0;
  }
}

// ── Color Scales ─────────────────────────────────────────────────────────────

export type ColorStop = [number, string];
type MapExpr = Array<string | number | MapExpr>;

export function getWeatherColorRamp(mode: WeatherMode): ColorStop[] {
  switch (mode) {
    case "temperature":
      return [
        [-30, "#0a1628"],
        [-10, "#1a4a8c"],
        [0,   "#2b7cbc"],
        [10,  "#81c784"],
        [20,  "#fff176"],
        [30,  "#ff8f00"],
        [40,  "#b71c1c"],
      ];
    case "wind":
      return [
        [0,   "#e3f2fd"],
        [5,   "#90caf9"],
        [10,  "#42a5f5"],
        [20,  "#1565c0"],
        [30,  "#0d47a1"],
        [50,  "#1a0050"],
      ];
    case "humidity":
      return [
        [0,   "#ffe08a"],
        [20,  "#f8d063"],
        [40,  "#d8d98f"],
        [60,  "#91d7c8"],
        [80,  "#57b3e3"],
        [100, "#2f6fb2"],
      ];
    case "precipitation":
      return [
        [0,   "rgba(0,0,0,0)"],
        [20,  "rgba(0,230,255,0.4)"],
        [40,  "rgba(0,140,255,0.55)"],
        [60,  "rgba(80,0,200,0.70)"],
        [80,  "rgba(180,0,100,0.82)"],
        [100, "rgba(255,0,50,0.92)"],
      ];
    default:
      return [[0, "rgba(0,0,0,0)"]];
  }
}

export function buildHeatmapColorExpr(mode: WeatherMode): MapExpr {
  // Map from heatmap-density (0–1) to color
  const palettes: Record<string, string[]> = {
    temperature:   ["#0a1628","#1a4a8c","#2b7cbc","#81c784","#fff176","#ff8f00","#b71c1c"],
    wind:          ["#e3f2fd","#90caf9","#42a5f5","#1565c0","#0d47a1","#1a0050"],
    humidity:      ["rgba(255,224,138,0)","#f8d063","#d8d98f","#91d7c8","#57b3e3","#2f6fb2"],
    precipitation: ["rgba(0,0,0,0)","rgba(0,230,255,0.4)","rgba(0,140,255,0.6)","rgba(80,0,200,0.75)","rgba(255,0,50,0.92)"],
  };

  const colors = palettes[mode] ?? ["rgba(0,0,0,0)"];
  const steps = colors.length;
  const expr: MapExpr = ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)"];
  colors.forEach((c, i) => {
    expr.push((i + 1) / steps, c);
  });
  return expr;
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function flightLevel(altFt: number): string {
  if (altFt < 1000) return `${Math.round(altFt)} ft`;
  return `FL${Math.round(altFt / 100).toString().padStart(3, "0")}`;
}

export function ktsLabel(v: number): string {
  return `${Math.round(v)} kts`;
}

export function kmhLabel(v: number): string {
  return `${Math.round(v)} km/h`;
}

export function compassPoint(deg: number): string {
  const pts = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return pts[Math.round(deg / 22.5) % 16];
}

export function formatCoord(v: number, axis: "lat" | "lon"): string {
  const abs = Math.abs(v).toFixed(4);
  if (axis === "lat") return `${abs}° ${v >= 0 ? "N" : "S"}`;
  return `${abs}° ${v >= 0 ? "E" : "W"}`;
}
