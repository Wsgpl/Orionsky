/**
 * Centralized map configuration derived from environment variables with defaults.
 */
import { INDIA_MAP_CENTER, INDIA_MAP_DEFAULT_ZOOM } from "../utils/indiaViewport";

const DEFAULT_DAY_BASEMAP_TILE_URL =
  import.meta.env.VITE_BASEMAP_DAY_TILE_URL ||
  import.meta.env.VITE_BASEMAP_TILE_URL ||
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";

const DEFAULT_NIGHT_BASEMAP_TILE_URL =
  import.meta.env.VITE_BASEMAP_NIGHT_TILE_URL ||
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export const MAP_CONFIG = {
  default_center: {
    lat: Number(import.meta.env.VITE_MAP_CENTER_LAT) || INDIA_MAP_CENTER.lat,
    lon: Number(import.meta.env.VITE_MAP_CENTER_LON) || INDIA_MAP_CENTER.lon,
  },
  default_zoom: Number(import.meta.env.VITE_MAP_DEFAULT_ZOOM) || INDIA_MAP_DEFAULT_ZOOM,
  weather_center: {
    lat: Number(import.meta.env.VITE_WEATHER_MAP_CENTER_LAT) || INDIA_MAP_CENTER.lat,
    lon: Number(import.meta.env.VITE_WEATHER_MAP_CENTER_LON) || INDIA_MAP_CENTER.lon,
  },
  weather_zoom: Number(import.meta.env.VITE_WEATHER_MAP_DEFAULT_ZOOM) || INDIA_MAP_DEFAULT_ZOOM,
  tiles: {
    basemap: DEFAULT_DAY_BASEMAP_TILE_URL,
    basemap_day: DEFAULT_DAY_BASEMAP_TILE_URL,
    basemap_night: DEFAULT_NIGHT_BASEMAP_TILE_URL,
    osm: import.meta.env.VITE_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    precipitation:
      import.meta.env.VITE_PRECIPITATION_TILE_URL ||
      "https://tilecache.rainviewer.com/v2/radar/0/256/{z}/{x}/{y}/2/1_1.png",
    temperature: import.meta.env.VITE_TEMPERATURE_TILE_URL,
  },
  zoom_thresholds: {
    humidity_detail: Number(import.meta.env.VITE_HUMIDITY_DETAIL_ZOOM) || 7.1,
    pressure_state: Number(import.meta.env.VITE_PRESSURE_STATE_ZOOM) || 4.6,
    pressure_capital: Number(import.meta.env.VITE_PRESSURE_CAPITAL_ZOOM) || 5.8,
    pressure_region: Number(import.meta.env.VITE_PRESSURE_REGION_ZOOM) || 7.1,
    pressure_detail: Number(import.meta.env.VITE_PRESSURE_DETAIL_ZOOM) || 8.5,
  },
  animation: {
    wind_particles_count: Number(import.meta.env.VITE_WIND_PARTICLES_COUNT) || 2000,
    wind_particle_speed: Number(import.meta.env.VITE_WIND_PARTICLE_SPEED) || 0.8,
    aircraft_steps: Number(import.meta.env.VITE_AIRCRAFT_ANIMATION_STEPS) || 18,
    aircraft_duration: Number(import.meta.env.VITE_AIRCRAFT_ANIMATION_DURATION) || 14000,
  },
};
