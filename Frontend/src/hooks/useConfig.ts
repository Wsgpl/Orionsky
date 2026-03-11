import { useEffect, useState } from "react";
import { configService } from "../config/configService";
import { MAP_CONFIG } from "../config/mapConfig";

interface MapConfig {
  default_center: { lat: number; lon: number };
  default_zoom: number;
  weather_center: { lat: number; lon: number };
  weather_zoom: number;
  tiles: {
    basemap: string;
    basemap_day?: string;
    basemap_night?: string;
    osm: string;
    precipitation: string;
    temperature?: string;
  };
  zoom_thresholds: {
    humidity_detail: number;
    pressure_state: number;
    pressure_capital: number;
    pressure_region: number;
    pressure_detail: number;
  };
  animation: {
    wind_particles_count: number;
    wind_particle_speed: number;
    aircraft_steps: number;
    aircraft_duration: number;
  };
}

function createDefaultMapConfig(): MapConfig {
  return {
    default_center: MAP_CONFIG.default_center,
    default_zoom: MAP_CONFIG.default_zoom,
    weather_center: MAP_CONFIG.weather_center,
    weather_zoom: MAP_CONFIG.weather_zoom,
    tiles: {
      basemap:
        MAP_CONFIG.tiles?.basemap ||
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      basemap_day:
        MAP_CONFIG.tiles?.basemap_day ||
        MAP_CONFIG.tiles?.basemap ||
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      basemap_night:
        MAP_CONFIG.tiles?.basemap_night ||
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      osm:
        MAP_CONFIG.tiles?.osm ||
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      precipitation:
        MAP_CONFIG.tiles?.precipitation ||
        "https://tilecache.rainviewer.com/v2/radar/0/256/{z}/{x}/{y}/2/1_1.png",
      temperature: MAP_CONFIG.tiles?.temperature,
    },
    zoom_thresholds: MAP_CONFIG.zoom_thresholds || {
      humidity_detail: 7.1,
      pressure_state: 4.6,
      pressure_capital: 5.8,
      pressure_region: 7.1,
      pressure_detail: 8.5,
    },
    animation: MAP_CONFIG.animation || {
      wind_particles_count: 2000,
      wind_particle_speed: 0.8,
      aircraft_steps: 18,
      aircraft_duration: 14000,
    },
  };
}

function normalizeMapConfig(data?: Partial<MapConfig>): MapConfig {
  const defaults = createDefaultMapConfig();

  if (!data) {
    return defaults;
  }

  const mergedTiles = {
    ...defaults.tiles,
    ...data.tiles,
  };

  const dayBasemap =
    data.tiles?.basemap_day ||
    data.tiles?.basemap ||
    mergedTiles.basemap_day ||
    defaults.tiles.basemap;
  const nightBasemap =
    data.tiles?.basemap_night ||
    mergedTiles.basemap_night ||
    defaults.tiles.basemap_night ||
    dayBasemap;

  return {
    ...defaults,
    ...data,
    default_center: {
      ...defaults.default_center,
      ...data.default_center,
    },
    weather_center: {
      ...defaults.weather_center,
      ...data.weather_center,
    },
    tiles: {
      ...mergedTiles,
      basemap: dayBasemap,
      basemap_day: dayBasemap,
      basemap_night: nightBasemap,
    },
    zoom_thresholds: {
      ...defaults.zoom_thresholds,
      ...data.zoom_thresholds,
    },
    animation: {
      ...defaults.animation,
      ...data.animation,
    },
  };
}

export function useMapConfig() {
  const [config, setConfig] = useState<MapConfig>(() => normalizeMapConfig());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    configService
      .getMapConfig()
      .then((data) => {
        if (data?.tiles) {
          setConfig(normalizeMapConfig(data));
        }
      })
      .catch((err) => {
        console.warn("Config fetch failed, using defaults", err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { config, loading, error };
}

export function useConfig() {
  const mapConfig = useMapConfig();

  return {
    map: mapConfig.config,
    loading: mapConfig.loading,
    error: mapConfig.error,
  };
}
