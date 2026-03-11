/**
 * Configuration service that fetches backend configuration and merges with environment variables
 */
import { MAP_CONFIG } from './mapConfig';
import { resolveApiBaseUrl } from './runtimeUrls';

export interface BackendConfig {
  map: {
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
  };
  airspace: {
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
  };
  weather: {
    grid_step: number;
    poll_interval: number;
    cache_ttl: number;
  };
  theme: {
    temperature: { min: number; max: number };
    humidity: { base_hue: number };
    pressure: { min: number; max: number };
    wind: { max_speed: number };
  };
}

export const DEFAULT_BACKEND_CONFIG: BackendConfig = {
  map: {
    default_center: MAP_CONFIG.default_center,
    default_zoom: MAP_CONFIG.default_zoom,
    weather_center: MAP_CONFIG.weather_center,
    weather_zoom: MAP_CONFIG.weather_zoom,
    tiles: MAP_CONFIG.tiles,
    zoom_thresholds: MAP_CONFIG.zoom_thresholds,
    animation: MAP_CONFIG.animation,
  },
  airspace: {
    min_lat: 6.0,
    max_lat: 38.0,
    min_lon: 68.0,
    max_lon: 98.0,
  },
  weather: {
    grid_step: 3,
    poll_interval: 300,
    cache_ttl: 600,
  },
  theme: {
    temperature: { min: 5.0, max: 40.0 },
    humidity: { base_hue: 190 },
    pressure: { min: 980.0, max: 1030.0 },
    wind: { max_speed: 30.0 },
  },
};

class ConfigService {
  private backendConfig: BackendConfig | null = null;
  private configPromise: Promise<BackendConfig> | null = null;

  async getConfig(): Promise<BackendConfig> {
    if (this.backendConfig) {
      return this.backendConfig;
    }

    if (this.configPromise) {
      return this.configPromise;
    }

    this.configPromise = this.fetchConfig();
    return this.configPromise;
  }

  private async fetchConfig(): Promise<BackendConfig> {
    try {
      const apiBaseUrl = resolveApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/v1/config`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status}`);
      }

      this.backendConfig = await response.json();
      return this.backendConfig!;
    } catch (error) {
      console.warn('Failed to fetch backend config, using defaults:', error);
      
      // Fallback to environment variables and defaults
      this.backendConfig = DEFAULT_BACKEND_CONFIG;
      
      return this.backendConfig;
    }
  }

  // Convenience methods for accessing specific config sections
  async getMapConfig() {
    const config = await this.getConfig();
    return config.map;
  }

  async getThemeConfig() {
    const config = await this.getConfig();
    return config.theme;
  }

  async getAirspaceConfig() {
    const config = await this.getConfig();
    return config.airspace;
  }

  async getWeatherConfig() {
    const config = await this.getConfig();
    return config.weather;
  }
}

export const configService = new ConfigService();
