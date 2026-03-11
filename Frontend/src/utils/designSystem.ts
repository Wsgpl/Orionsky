import type { Theme, WeatherMode } from "../types";

export type AppPalette = {
  accent: string;
  accentSoft: string;
  panelBackground: string;
  panelElevatedBackground: string;
  panelBorder: string;
  panelShadow: string;
  surfaceBackground: string;
  surfaceBorder: string;
  textStrong: string;
  textBody: string;
  textMuted: string;
  textSoft: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  overlayScrim: string;
};

export const FOUNDATION_COLORS = {
  accent: "#0f5f91",
  accentSoft: "rgba(15, 95, 145, 0.12)",
  textStrong: "#0f172a",
  textBody: "#334155",
  textMuted: "#64748b",
  textSoft: "#94a3b8",
  borderSoft: "rgba(148, 163, 184, 0.26)",
  borderStrong: "rgba(100, 116, 139, 0.34)",
  panelGlassTop: "rgba(255, 255, 255, 0.68)",
  panelGlassBottom: "rgba(241, 245, 249, 0.48)",
  panelElevatedTop: "rgba(255, 255, 255, 0.82)",
  panelElevatedBottom: "rgba(226, 232, 240, 0.58)",
  panelBorder: "rgba(255, 255, 255, 0.38)",
  panelShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
  surfaceBackground: "rgba(255, 255, 255, 0.62)",
  surfaceBorder: "rgba(148, 163, 184, 0.24)",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#2563eb",
  wind: "#0284c7",
  humidity: "#2563eb",
  pressure: "#7c3aed",
  visibility: "#0f766e",
  feelsLike: "#ea580c",
  cloud: "#475569",
  temperature: "#ea580c",
  precipitation: "#2563eb",
} as const;

export const WEATHER_LAYER_ACCENTS: Record<Exclude<WeatherMode, "none">, string> = {
  temperature: FOUNDATION_COLORS.temperature,
  wind: FOUNDATION_COLORS.wind,
  precipitation: FOUNDATION_COLORS.precipitation,
  humidity: FOUNDATION_COLORS.humidity,
  pressure: FOUNDATION_COLORS.pressure,
};

export const WEATHER_METRIC_ACCENTS = {
  wind: FOUNDATION_COLORS.wind,
  humidity: FOUNDATION_COLORS.humidity,
  pressure: FOUNDATION_COLORS.pressure,
  precipitation: FOUNDATION_COLORS.precipitation,
  visibility: FOUNDATION_COLORS.visibility,
  feelsLike: FOUNDATION_COLORS.feelsLike,
  cloud: FOUNDATION_COLORS.cloud,
} as const;

export function getAppPalette(theme: Theme): AppPalette {
  if (theme === "day") {
    return {
      accent: FOUNDATION_COLORS.accent,
      accentSoft: FOUNDATION_COLORS.accentSoft,
      panelBackground: `linear-gradient(180deg, ${FOUNDATION_COLORS.panelGlassTop}, ${FOUNDATION_COLORS.panelGlassBottom})`,
      panelElevatedBackground: `linear-gradient(180deg, ${FOUNDATION_COLORS.panelElevatedTop}, ${FOUNDATION_COLORS.panelElevatedBottom})`,
      panelBorder: FOUNDATION_COLORS.panelBorder,
      panelShadow: FOUNDATION_COLORS.panelShadow,
      surfaceBackground: FOUNDATION_COLORS.surfaceBackground,
      surfaceBorder: FOUNDATION_COLORS.surfaceBorder,
      textStrong: FOUNDATION_COLORS.textStrong,
      textBody: FOUNDATION_COLORS.textBody,
      textMuted: FOUNDATION_COLORS.textMuted,
      textSoft: FOUNDATION_COLORS.textSoft,
      success: FOUNDATION_COLORS.success,
      warning: FOUNDATION_COLORS.warning,
      danger: FOUNDATION_COLORS.danger,
      info: FOUNDATION_COLORS.info,
      overlayScrim: "rgba(15, 23, 42, 0.18)",
    };
  }

  return {
    accent: FOUNDATION_COLORS.accent,
    accentSoft: "rgba(15, 95, 145, 0.16)",
    panelBackground: "linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(241, 245, 249, 0.54))",
    panelElevatedBackground: "linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(226, 232, 240, 0.62))",
    panelBorder: "rgba(255, 255, 255, 0.42)",
    panelShadow: "0 20px 44px rgba(2, 6, 23, 0.18)",
    surfaceBackground: "rgba(255, 255, 255, 0.68)",
    surfaceBorder: "rgba(148, 163, 184, 0.28)",
    textStrong: FOUNDATION_COLORS.textStrong,
    textBody: FOUNDATION_COLORS.textBody,
    textMuted: FOUNDATION_COLORS.textMuted,
    textSoft: FOUNDATION_COLORS.textSoft,
    success: FOUNDATION_COLORS.success,
    warning: FOUNDATION_COLORS.warning,
    danger: FOUNDATION_COLORS.danger,
    info: FOUNDATION_COLORS.info,
    overlayScrim: "rgba(15, 23, 42, 0.22)",
  };
}
