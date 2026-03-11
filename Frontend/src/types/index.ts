export interface Aircraft {
  icao: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  on_ground: boolean;
}

export interface AircraftListResponse {
  count: number;
  aircraft: Aircraft[];
}

export interface WeatherData {
  latitude: number;
  longitude: number;
  temperature: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_direction: number;
  cloud_cover: number;
  visibility: number;
  condition: string;
  source: string;
}

export interface WeatherCell {
  cell_key: string;
  data: WeatherData;
}

export interface WeatherGridResponse {
  count: number;
  cells: WeatherCell[];
}

export interface WeatherAdvisory {
  aircraft: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  warnings: string[];
}

export interface WeatherAdvisoryResponse {
  count: number;
  advisories: WeatherAdvisory[];
}

export interface SnapshotResponse {
  aircraft: AircraftListResponse;
  weather: WeatherGridResponse;
  advisories: WeatherAdvisoryResponse;
}

export type WeatherMode =
  | "none"
  | "temperature"
  | "wind"
  | "precipitation"
  | "humidity"
  | "pressure";

export type Theme = "day" | "night";
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting";

export interface MapState {
  zoom: number;
  center: [number, number];
  bearing: number;
  pitch: number;
}
