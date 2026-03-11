import axios, { AxiosError, AxiosInstance } from "axios";
import {
  AirQualityGridResponse,
  AircraftListResponse,
  AviationAlertResponse,
  AviationForecastResponse,
  AviationMetarResponse,
  AuthSession,
  ApiKeyListResponse,
  ApiKeySecretResponse,
  DisasterContextResponse,
  ForecastResponse,
  HealthLive,
  HealthReady,
  MissionExportDownload,
  MissionExportKmlRequest,
  MissionDefinition,
  MissionHistoryItem,
  MissionHistoryListResponse,
  MissionExportTxtRequest,
  RegistrationResponse,
  RouteRiskAnalyzeRequest,
  RouteRiskAnalyzeResponse,
  SnapshotResponse,
  TokenResponse,
  UsageReportResponse,
  VerifyEmailResponse,
  WeatherAdvisoryResponse,
  WeatherGridResponse,
} from "../types";
import { resolveApiBaseUrl } from "../config/runtimeUrls";
import { createAuthSession, readStoredSession, writeStoredSession } from "../utils/authSession";

const BASE_URL = resolveApiBaseUrl();
const API_KEY = import.meta.env.VITE_API_KEY || null;
const AUTH_USERNAME = import.meta.env.VITE_AUTH_USERNAME || null;
const AUTH_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD || null;
const LOGIN_PATH = "/api/v1/auth/token";
const AUTH_SESSION_EVENT = "flight-radar:auth-session";

type RetriableRequestConfig = {
  _retry?: boolean;
};

type ForecastParams = {
  query?: string;
  lat?: number;
  lon?: number;
};

type ApiKeyCreatePayload = {
  name: string;
  plan: string;
  key?: string;
};

type ApiKeyRotatePayload = {
  plan?: string;
};

type MissionHistorySavePayload = {
  mission: MissionDefinition;
  sample_spacing_km?: number;
};

type UsageQueryParams = {
  start_date?: string;
  end_date?: string;
};

function parseFilenameFromContentDisposition(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }

  const encodedMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const plainMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i);
  return plainMatch?.[1] ?? null;
}

class ApiService {
  private client: AxiosInstance;
  private session: AuthSession | null = readStoredSession();
  private loginPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 15_000,
      headers: { "Content-Type": "application/json" },
    });

    this.client.interceptors.request.use((config) => {
      config.headers = config.headers ?? {};

      if (API_KEY) {
        config.headers["X-API-Key"] = API_KEY;
      }
      if (this.session?.access_token) {
        config.headers.Authorization = `Bearer ${this.session.access_token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      async (err: AxiosError) => {
        const requestConfig = err.config as (typeof err.config & RetriableRequestConfig) | undefined;
        if (
          err.response?.status === 401 &&
          !API_KEY &&
          AUTH_USERNAME &&
          AUTH_PASSWORD &&
          requestConfig &&
          !requestConfig._retry &&
          (!this.session || this.session.source === "env")
        ) {
          requestConfig._retry = true;
          await this.login();
          return this.client.request(requestConfig);
        }
        if (err.response?.status === 401 && this.session?.source === "manual") {
          this.clearSession();
        }
        return Promise.reject(err);
      }
    );
  }

  private setSession(tokenResponse: TokenResponse, source: AuthSession["source"]): AuthSession {
    const session = createAuthSession(tokenResponse, source);
    this.session = session;
    writeStoredSession(session);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: session }));
    }
    return session;
  }

  async login(): Promise<void> {
    if (this.session) {
      return;
    }
    if (!AUTH_USERNAME || !AUTH_PASSWORD) {
      return;
    }
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
      try {
        await this.loginWithCredentials(AUTH_USERNAME, AUTH_PASSWORD, "env");
      } finally {
        this.loginPromise = null;
      }
    })();

    return this.loginPromise;
  }

  async loginWithCredentials(
    username: string,
    password: string,
    source: AuthSession["source"] = "manual"
  ): Promise<TokenResponse> {
    const res = await axios.post<TokenResponse>(`${BASE_URL}${LOGIN_PATH}`, {
      username,
      password,
    });
    this.setSession(res.data, source);
    return res.data;
  }

  async loginUser(email: string, password: string): Promise<TokenResponse> {
    const res = await axios.post<TokenResponse>(`${BASE_URL}/api/v1/auth/login`, {
      email,
      password,
    });
    this.setSession(res.data, "manual");
    return res.data;
  }

  async registerUser(name: string, email: string, password: string): Promise<RegistrationResponse> {
    const res = await axios.post<RegistrationResponse>(`${BASE_URL}/api/v1/auth/register`, {
      name,
      email,
      password,
    });
    return res.data;
  }

  async resendVerification(email: string): Promise<RegistrationResponse> {
    const res = await axios.post<RegistrationResponse>(`${BASE_URL}/api/v1/auth/resend-verification`, {
      email,
    });
    return res.data;
  }

  async verifyEmail(token: string): Promise<VerifyEmailResponse> {
    const res = await axios.get<VerifyEmailResponse>(`${BASE_URL}/api/v1/auth/verify-email`, {
      params: { token },
    });
    return res.data;
  }

  clearSession(): void {
    this.session = null;
    writeStoredSession(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: null }));
    }
  }

  hasToken(): boolean {
    return Boolean(this.session?.access_token);
  }

  isAuthenticated(): boolean {
    return Boolean(this.session);
  }

  hasAdminToken(): boolean {
    return this.session?.role === "admin";
  }

  getSession(): AuthSession | null {
    return this.session;
  }

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

  async getForecast(params: ForecastParams): Promise<ForecastResponse> {
    const res = await this.client.get<ForecastResponse>("/api/v1/forecast", {
      params,
    });
    return res.data;
  }

  async getAviationMetar(ids: string): Promise<AviationMetarResponse> {
    const res = await this.client.get<AviationMetarResponse>("/api/v1/aviation/metar", {
      params: { ids },
    });
    return res.data;
  }

  async getAviationTaf(ids: string): Promise<AviationForecastResponse> {
    const res = await this.client.get<AviationForecastResponse>("/api/v1/aviation/taf", {
      params: { ids },
    });
    return res.data;
  }

  async getAviationSigmet(): Promise<AviationAlertResponse> {
    const res = await this.client.get<AviationAlertResponse>("/api/v1/aviation/sigmet");
    return res.data;
  }

  async getAirQuality(): Promise<AirQualityGridResponse> {
    const res = await this.client.get<AirQualityGridResponse>("/api/v1/air-quality");
    return res.data;
  }

  async getDisasters(): Promise<DisasterContextResponse> {
    const res = await this.client.get<DisasterContextResponse>("/api/v1/disasters");
    return res.data;
  }

  async getSnapshot(): Promise<SnapshotResponse> {
    const res = await this.client.get<SnapshotResponse>("/api/v1/snapshot");
    return res.data;
  }

  async analyzeRouteRisk(payload: RouteRiskAnalyzeRequest): Promise<RouteRiskAnalyzeResponse> {
    const res = await this.client.post<RouteRiskAnalyzeResponse>("/api/v1/route-risk/analyze", payload, {
      timeout: 30_000,
    });
    return res.data;
  }

  async exportMissionKml(payload: MissionExportKmlRequest): Promise<MissionExportDownload> {
    const res = await this.client.post<Blob>("/api/v1/mission-export/kml", payload, {
      responseType: "blob",
    });
    return {
      blob: res.data,
      filename: parseFilenameFromContentDisposition(res.headers["content-disposition"]) ?? "mission.kml",
      contentType: res.headers["content-type"] ?? null,
    };
  }

  async exportMissionTxt(payload: MissionExportTxtRequest): Promise<MissionExportDownload> {
    const res = await this.client.post<Blob>("/api/v1/mission-export/txt", payload, {
      responseType: "blob",
    });
    return {
      blob: res.data,
      filename: parseFilenameFromContentDisposition(res.headers["content-disposition"]) ?? "mission.txt",
      contentType: res.headers["content-type"] ?? null,
    };
  }

  async getMissionHistory(): Promise<MissionHistoryListResponse> {
    const res = await this.client.get<MissionHistoryListResponse>("/api/v1/missions");
    return res.data;
  }

  async saveMissionHistory(payload: MissionHistorySavePayload): Promise<MissionHistoryItem> {
    const res = await this.client.post<MissionHistoryItem>("/api/v1/missions", payload);
    return res.data;
  }

  async getFrontendConfig(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>("/api/v1/config");
    return res.data;
  }

  async getHealthLive(): Promise<HealthLive> {
    const res = await this.client.get<HealthLive>("/health/live");
    return res.data;
  }

  async getHealthReady(): Promise<HealthReady> {
    const res = await this.client.get<HealthReady>("/health/ready");
    return res.data;
  }

  async getMetrics(): Promise<string> {
    const res = await this.client.get<string>("/metrics", {
      responseType: "text",
    });
    return res.data;
  }

  async getApiKeys(): Promise<ApiKeyListResponse> {
    const res = await this.client.get<ApiKeyListResponse>("/api/v1/api-keys");
    return res.data;
  }

  async createApiKey(payload: ApiKeyCreatePayload): Promise<ApiKeySecretResponse> {
    const res = await this.client.post<ApiKeySecretResponse>("/api/v1/api-keys", payload);
    return res.data;
  }

  async rotateApiKey(name: string, payload: ApiKeyRotatePayload): Promise<ApiKeySecretResponse> {
    const res = await this.client.post<ApiKeySecretResponse>(`/api/v1/api-keys/${name}/rotate`, payload);
    return res.data;
  }

  async revokeApiKey(name: string): Promise<{ status: string; name: string }> {
    const res = await this.client.post<{ status: string; name: string }>(`/api/v1/api-keys/${name}/revoke`);
    return res.data;
  }

  async getApiKeyUsage(name: string, params: UsageQueryParams = {}): Promise<UsageReportResponse> {
    const res = await this.client.get<UsageReportResponse>(`/api/v1/api-keys/${name}/usage`, {
      params,
    });
    return res.data;
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.getHealthLive();
      return true;
    } catch {
      return false;
    }
  }
}

export const api = new ApiService();
export { AUTH_SESSION_EVENT };
