import type { AuthSession, TokenResponse } from "../types";

export const AUTH_SESSION_STORAGE_KEY = "flight_radar.auth_session";

function isValidSession(value: unknown): value is AuthSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<AuthSession>;
  return typeof candidate.access_token === "string" && typeof candidate.expires_at === "string";
}

export function createAuthSession(
  token: TokenResponse,
  source: AuthSession["source"]
): AuthSession {
  return {
    ...token,
    source,
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  };
}

export function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSession(parsed)) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }

    if (new Date(parsed.expires_at).getTime() <= Date.now()) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

export function writeStoredSession(session: AuthSession | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}
