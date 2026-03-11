export interface Aircraft {
  icao: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  on_ground: boolean;
  source?: string | null;
  aircraft_type?: string | null;
  category?: string | null;
  flight_status?: string;
  nearest_weather_cell_key?: string | null;
  weather_alert_level?: WeatherAlertLevel | null;
  risk_flag?: "HIGH RISK" | null;
  classification?: "Helicopter" | "Commercial" | "Private";
}

export interface AircraftListResponse {
  count: number;
  aircraft: Aircraft[];
}

export interface WeatherData {
  latitude: number;
  longitude: number;
  temperature: number;
  precip_mm: number | null;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_direction: number;
  cloud_cover: number;
  visibility: number;
  condition: string | null;
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

export type WeatherAlertLevel = "yellow" | "orange" | "red";

export interface AviationCloudLayer {
  coverage: string | null;
  base_ft_agl: number | null;
  top_ft_agl: number | null;
}

export interface AviationAirportWeatherData {
  station_id: string;
  latitude: number | null;
  longitude: number | null;
  observation_time: string | null;
  raw_text: string | null;
  visibility_sm: number | null;
  wind_speed_kt: number | null;
  wind_gust_kt: number | null;
  wind_direction_deg: number | null;
  temperature_c: number | null;
  dewpoint_c: number | null;
  altimeter_in_hg: number | null;
  pressure_hpa: number | null;
  ceiling_ft_agl: number | null;
  cloud_layers: AviationCloudLayer[];
  flight_category: string | null;
  source: string;
}

export interface AviationMetarResponse {
  count: number;
  metars: AviationAirportWeatherData[];
}

export interface AviationForecastPeriod {
  start_time: string | null;
  end_time: string | null;
  change_indicator: string | null;
  probability_percent: number | null;
  raw_text: string | null;
  visibility_sm: number | null;
  wind_speed_kt: number | null;
  wind_gust_kt: number | null;
  wind_direction_deg: number | null;
  cloud_layers: AviationCloudLayer[];
  weather: string | null;
  source: string;
}

export interface AviationForecastData {
  station_id: string;
  issue_time: string | null;
  valid_from: string | null;
  valid_to: string | null;
  raw_text: string | null;
  forecast_periods: AviationForecastPeriod[];
  source: string;
}

export interface AviationForecastResponse {
  count: number;
  tafs: AviationForecastData[];
}

export interface AviationAlertData {
  alert_id: string | null;
  designator: string | null;
  issued_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  hazard_type: string | null;
  description: string | null;
  raw_text: string | null;
  affected_region: string | null;
  geometry: Record<string, unknown> | null;
  source: string;
}

export interface AviationAlertResponse {
  count: number;
  sigmets: AviationAlertData[];
}

export interface AirQualityData {
  latitude: number;
  longitude: number;
  timestamp: string | null;
  pm25: number | null;
  pm10: number | null;
  ozone: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  aqi_category: string | null;
  source: string;
}

export interface AirQualityCellResponse {
  cell_key: string;
  data: AirQualityData;
}

export interface AirQualityUnits {
  pm25: string;
  pm10: string;
  ozone: string;
  no2: string;
  so2: string;
  co: string;
}

export interface AirQualityGridResponse {
  source: string;
  count: number;
  units: AirQualityUnits;
  cells: AirQualityCellResponse[];
}

export interface DisasterGeometry {
  encoding: "wkt";
  wkt: string;
  kind: string | null;
}

export interface DisasterArea {
  name: string | null;
  geometry: DisasterGeometry | null;
  is_real_extent: boolean | null;
  area_sq_km: number | null;
}

export interface DisasterLinks {
  report: string | null;
  viewer: string | null;
  story_map: string | null;
  dashboard: string | null;
  products_download: string | null;
  geodata_download: string | null;
  reporting_download: string | null;
  ancillary_products_download: string | null;
  raster_data_download: string | null;
}

export interface DisasterContextData {
  event_id: string;
  event_type: string | null;
  event_subtype: string | null;
  drm_phase: string | null;
  title: string | null;
  description: string | null;
  severity_indicator: string | null;
  event_time: string | null;
  issued_at: string | null;
  updated_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  continent: string | null;
  country_names: string[];
  area_names: string[];
  geometry: DisasterGeometry | null;
  areas: DisasterArea[];
  links: DisasterLinks | null;
  closed: boolean | null;
  source: string;
}

export interface DisasterContextResponse {
  source: string;
  count: number;
  events: DisasterContextData[];
}

export interface SnapshotResponse {
  aircraft: AircraftListResponse;
  weather: WeatherGridResponse;
  advisories: WeatherAdvisoryResponse;
}

export interface ForecastLocation {
  query: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ForecastCurrent {
  source: string;
  temperature: number;
  apparent_temperature?: number | null;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_direction: number;
  precipitation_amount: number | null;
  cloud_cover: number;
  visibility: number;
  condition: string | null;
  observed_at: string | null;
}

export interface HourlyForecastItem {
  source: string;
  time: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  cloud_cover: number | null;
  visibility: number | null;
  precipitation_probability: number | null;
  precipitation_amount: number | null;
  condition: string | null;
}

export interface DailyForecastItem {
  source: string;
  date: string;
  temp_min: number | null;
  temp_max: number | null;
  wind_speed: number | null;
  precipitation_probability: number | null;
  precipitation_amount: number | null;
  condition: string | null;
}

export interface ForecastResponse {
  source: string;
  location: ForecastLocation;
  current: ForecastCurrent | null;
  hourly: HourlyForecastItem[];
  daily: DailyForecastItem[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  subject: string;
  role: "admin" | "user";
  email: string | null;
  name: string | null;
  email_verified: boolean;
}

export interface AuthSession extends TokenResponse {
  expires_at: string;
  source: "manual" | "env";
}

export interface RegistrationResponse {
  status: "pending_verification" | "registered";
  message: string;
  email: string;
  expires_in: number;
}

export interface VerifyEmailResponse {
  status: "verified";
  message: string;
  email: string;
}

export interface HealthLive {
  status: string;
  version: string;
  environment: string;
}

export interface HealthReady {
  status: string;
  redis: string;
  opensky_circuit: string;
  openmeteo_circuit: string;
  awc_metar_circuit?: string | null;
  awc_taf_circuit?: string | null;
  awc_sigmet_circuit?: string | null;
  copernicus_cams_circuit?: string | null;
  copernicus_cems_circuit?: string | null;
  adsblol_circuit?: string | null;
  icao_aircraft_circuit?: string | null;
}

export interface ApiKeySecretResponse {
  name: string;
  plan: string;
  api_key: string;
  note: string;
}

export interface ApiKeyItem {
  name: string;
  plan: string;
  active: boolean;
  source: string;
  created_at: string | null;
  updated_at: string | null;
  revoked_at: string | null;
}

export interface ApiKeyListResponse {
  count: number;
  keys: ApiKeyItem[];
}

export interface UsageRow {
  endpoint: string;
  requests: number;
}

export interface DailyUsage {
  date: string;
  total: number;
  ok_2xx: number;
  client_4xx: number;
  server_5xx: number;
  by_endpoint: UsageRow[];
}

export interface UsageReportResponse {
  api_key_name: string;
  plan: string;
  start_date: string;
  end_date: string;
  days: DailyUsage[];
  total_requests: number;
}

export interface AircraftFilters {
  altitudeMin: number | null;
  altitudeMax: number | null;
  speedMin: number | null;
  aircraftType: string;
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

export interface MissionCoordinate {
  lat: number;
  lon: number;
  alt?: number | null;
}

export type MissionGeometryType = "LineString" | "Polygon";
export type MissionGeometryMetadata = Record<string, unknown>;

export interface MissionMetadata {
  mission_id?: string | null;
  name: string | null;
  description?: string | null;
  tags: string[];
  created_at?: string | null;
  updated_at?: string | null;
  attributes?: Record<string, unknown> | null;
}

export interface MissionGeometryBase {
  name: string | null;
  metadata?: MissionGeometryMetadata | null;
}

export interface MissionLineStringGeometry extends MissionGeometryBase {
  type: "LineString";
  coordinates: MissionCoordinate[];
}

export interface MissionPolygonGeometry extends MissionGeometryBase {
  type: "Polygon";
  coordinates: MissionCoordinate[];
}

export type MissionGeometry = MissionLineStringGeometry | MissionPolygonGeometry;
export interface MissionGeometryWrapper {
  metadata: MissionMetadata;
  geometry: MissionGeometry;
}
export interface MissionDefinition extends MissionGeometryWrapper { }
export interface MissionExportModel extends MissionGeometryWrapper { }
export interface MissionRouteAnalysisModel {
  metadata: MissionMetadata;
  geometry: MissionLineStringGeometry;
}
export type MissionPlannerGeometryMode = "route" | "polygon";
export type MissionPlannerPointKind = "origin" | "waypoint" | "destination" | "polygon_vertex";

export interface MissionPlannerPoint extends MissionCoordinate {
  id: string;
  kind: MissionPlannerPointKind;
  label: string;
}

export type RouteCoordinate = MissionCoordinate;
export type RoutePlannerPointKind = Extract<MissionPlannerPointKind, "origin" | "waypoint" | "destination">;
export interface RoutePlannerPoint extends MissionPlannerPoint {
  kind: RoutePlannerPointKind;
}
export interface PolygonPlannerPoint extends MissionPlannerPoint {
  kind: "polygon_vertex";
}

export interface ActiveMissionState {
  mission: MissionDefinition | null;
  geometryMode: MissionPlannerGeometryMode;
  sampleSpacingKm: number;
}

export interface RouteRiskAnalyzeRequest {
  mission?: MissionRouteAnalysisModel;
  geometry?: MissionLineStringGeometry;
  sample_spacing_km: number;
}

export interface MissionExportKmlRequest {
  mission?: MissionExportModel;
  geometry?: MissionGeometry;
}

export interface MissionExportTxtRequest {
  mission?: MissionExportModel;
  geometry?: MissionGeometry;
}

export interface MissionExportDownload {
  blob: Blob;
  filename: string;
  contentType: string | null;
}

export interface MissionHistoryItem {
  mission_id: string;
  mission_name: string;
  geometry_type: MissionGeometryType;
  coordinate_count: number;
  sample_spacing_km: number | null;
  saved_at: string;
  updated_at: string;
  mission: MissionDefinition;
}

export interface MissionHistoryListResponse {
  count: number;
  missions: MissionHistoryItem[];
}

export type AviationRiskCategory =
  | "wind"
  | "visibility"
  | "precipitation"
  | "storm"
  | "ceiling"
  | "disaster"
  | "air_quality";

export type AviationRiskLevel = "low" | "medium" | "high";

export interface AviationRiskAirportContext {
  icao: string;
  iata: string | null;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  distance_km: number;
}

export interface AviationRiskItem {
  category: AviationRiskCategory;
  level: AviationRiskLevel | null;
  value: number | string | null;
  threshold_used: string | null;
  source: string | null;
  explanation: string;
}

export interface RouteRiskPointAssessment {
  sample_index: number;
  coordinate: MissionCoordinate;
  distance_from_start_km: number;
  is_route_vertex: boolean;
  nearest_airport: AviationRiskAirportContext | null;
  overall_level: AviationRiskLevel | null;
  score: number | null;
  factor_count: number;
  skipped_categories: AviationRiskCategory[];
  factors: AviationRiskItem[];
  explanation: string;
}

export interface RouteRiskSegmentAssessment {
  segment_index: number;
  start_sample_index: number;
  end_sample_index: number;
  start: MissionCoordinate;
  end: MissionCoordinate;
  distance_km: number;
  overall_level: AviationRiskLevel | null;
  score: number | null;
  factor_count: number;
  skipped_categories: AviationRiskCategory[];
  factors: AviationRiskItem[];
  explanation: string;
}

export interface RouteRiskAnalyzeResponse {
  route_summary: string;
  total_distance_km: number;
  route_point_count: number;
  requested_sample_spacing_km: number;
  sample_spacing_km: number;
  sampling_adjusted: boolean;
  sample_point_count: number;
  sample_points: RouteRiskPointAssessment[];
  segment_count: number;
  segments: RouteRiskSegmentAssessment[];
  worst_sections: RouteRiskSegmentAssessment[];
  overall_score: number | null;
  overall_level: AviationRiskLevel | null;
  factor_count: number;
  factors: AviationRiskItem[];
  skipped_categories: AviationRiskCategory[];
  unavailable_categories: AviationRiskCategory[];
  explanation: string;
}
