function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function shouldIgnoreConfiguredUrl(configuredUrl: string): boolean {
  if (typeof window === "undefined" || import.meta.env.DEV) {
    return false;
  }

  const parsed = parseUrl(configuredUrl);
  if (!parsed) {
    return false;
  }

  return isLoopbackHost(parsed.hostname) && !isLoopbackHost(window.location.hostname);
}

function getConfiguredApiBaseUrl(): string {
  const configured = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || "");
  if (!configured || shouldIgnoreConfiguredUrl(configured)) {
    return "";
  }
  return configured;
}

function getConfiguredWsBaseUrl(): string {
  const configured = trimTrailingSlash(import.meta.env.VITE_WS_URL || "");
  if (!configured || shouldIgnoreConfiguredUrl(configured.replace(/^ws/i, "http"))) {
    return "";
  }
  return configured;
}

export function resolveApiBaseUrl(): string {
  const configured = getConfiguredApiBaseUrl();
  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined") {
    return import.meta.env.DEV ? "" : trimTrailingSlash(window.location.origin);
  }

  return "http://localhost:8000";
}

export function resolveWsBaseUrl(): string {
  const configured = getConfiguredWsBaseUrl();
  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined") {
    if (import.meta.env.DEV) {
      return "ws://localhost:8000";
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}`;
  }

  return "ws://localhost:8000";
}
