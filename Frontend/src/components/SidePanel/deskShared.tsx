import type { ReactNode } from "react";

export function formatProviderLabel(source: string | null | undefined): string {
  const normalized = source?.trim().toLowerCase();
  switch (normalized) {
    case "openmeteo":
      return "Open-Meteo";
    case "awc":
      return "AWC";
    case "copernicus_cams":
      return "Copernicus CAMS";
    case "copernicus_cems":
      return "Copernicus CEMS";
    case "unavailable":
      return "Unavailable";
    default:
      return source?.trim() || "Unavailable";
  }
}

export function formatShortDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", weekday: "short" });
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const maybeAxios = error as {
      response?: {
        data?: {
          detail?: string;
        };
      };
      message?: string;
    };
    if (maybeAxios.response?.data?.detail) {
      return maybeAxios.response.data.detail;
    }
    if (maybeAxios.message) {
      return maybeAxios.message;
    }
  }
  return fallback;
}

export function OverviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="sp-overview-tile">
      <span className="sp-overview-label">{label}</span>
      <span className="sp-overview-value">{value}</span>
    </div>
  );
}

export function StatusRow({
  label,
  value,
  meta,
  tone = "neutral",
  accessory,
}: {
  label: string;
  value: string;
  meta?: string | null;
  tone?: "neutral" | "success" | "warning" | "danger";
  accessory?: ReactNode;
}) {
  return (
    <div className={`sp-status-row sp-status-row--${tone}`}>
      <div>
        <div className="sp-status-row__label">{label}</div>
        {meta ? <div className="sp-status-row__meta">{meta}</div> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <div className="sp-status-row__value">{value}</div>
        {accessory}
      </div>
    </div>
  );
}

export function InlineNotice({
  tone,
  message,
}: {
  tone: "danger" | "info";
  message: string;
}) {
  return <div className={`sp-inline-notice sp-inline-notice--${tone}`}>{message}</div>;
}

export function SourceBadge({ source }: { source: string | null | undefined }) {
  return <span className="sp-inline-badge sp-inline-badge--muted">{formatProviderLabel(source)}</span>;
}
