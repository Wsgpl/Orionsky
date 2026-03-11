import axios, { AxiosInstance, AxiosError } from "axios";
import {
  AircraftListResponse,
  WeatherGridResponse,
  WeatherAdvisoryResponse,
  SnapshotResponse,
} from "../types";

function resolveApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:8000";
}

const BASE_URL = resolveApiBaseUrl();
const API_KEY = import.meta.env.VITE_API_KEY || null;
const AUTH_USERNAME = import.meta.env.VITE_AUTH_USERNAME || null;
const AUTH_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD || null;

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 15_000,
      headers: { "Content-Type": "application/json" },
    });

    // Attach token to every request
    this.client.interceptors.request.use((config) => {
      if (API_KEY) {
        config.headers["X-API-Key"] = API_KEY;
      }
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Auto re-login on 401
    this.client.interceptors.response.use(
      (res) => res,
      async (err: AxiosError) => {
        if (
          err.response?.status === 401 &&
          !API_KEY &&
          AUTH_USERNAME &&
          AUTH_PASSWORD &&
          !this.loginPromise
        ) {
          await this.login();
          return this.client.request(err.config!);
        }
        return Promise.reject(err);
      }
    );
  }

  async login(): Promise<void> {
    if (!AUTH_USERNAME || !AUTH_PASSWORD) {
      return;
    }
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      try {
        const res = await axios.post(`${BASE_URL}/api/v1/auth/token`, {
          username: AUTH_USERNAME,
          password: AUTH_PASSWORD,
        });
        this.token = res.data.access_token;
      } catch (e) {
        console.error("[AeroIntel] Auth failed:", e);
      } finally {
        this.loginPromise = null;
      }
    })();
    return this.loginPromise;
  }

  // ── Endpoints ──────────────────────────────────────────────────────────────

  async getAircraft(): Promise<AircraftListResponse> {
    const res = await this.client.get<AircraftListResponse>("/api/v1/aircraft");
    return res.data;
  }

  async getWeather(): Promise<WeatherGridResponse> {
    const res = await this.client.get<WeatherGridResponse>("/api/v1/weather");
    return res.data;
  }

  async getWeatherAdvisories(): Promise<WeatherAdvisoryResponse> {
    const res = await this.client.get<WeatherAdvisoryResponse>("/api/v1/weather/advisories");
    return res.data;
  }

  async getSnapshot(): Promise<SnapshotResponse> {
    const res = await this.client.get<SnapshotResponse>("/api/v1/snapshot");
    return res.data;
  }

  async checkHealth(): Promise<boolean> {
    try {
      await axios.get(`${BASE_URL}/health/live`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

export const api = new ApiService();
