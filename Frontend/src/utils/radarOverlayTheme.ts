import type { Theme } from "../types";
import { getAppPalette } from "./designSystem";

export type RadarOverlayPalette = {
  panelBackground: string;
  panelBorder: string;
  panelShadow: string;
  panelText: string;
  panelSubtle: string;
  panelMuted: string;
  surfaceBackground: string;
  surfaceBorder: string;
  surfaceText: string;
  surfaceMuted: string;
  buttonIdleBackground: string;
  buttonIdleBorder: string;
  buttonIdleText: string;
  buttonDisabledBackground: string;
  buttonDisabledText: string;
  homeBackground: string;
  homeBorder: string;
  homeText: string;
};

export function getRadarOverlayPalette(theme: Theme): RadarOverlayPalette {
  const palette = getAppPalette(theme);
  return {
    panelBackground: palette.panelBackground,
    panelBorder: palette.panelBorder,
    panelShadow: palette.panelShadow,
    panelText: palette.textStrong,
    panelSubtle: palette.accent,
    panelMuted: palette.textMuted,
    surfaceBackground: palette.surfaceBackground,
    surfaceBorder: palette.surfaceBorder,
    surfaceText: palette.textStrong,
    surfaceMuted: palette.textMuted,
    buttonIdleBackground: palette.surfaceBackground,
    buttonIdleBorder: palette.surfaceBorder,
    buttonIdleText: palette.textBody,
    buttonDisabledBackground: "rgba(226, 232, 240, 0.68)",
    buttonDisabledText: palette.textSoft,
    homeBackground: palette.panelElevatedBackground,
    homeBorder: palette.panelBorder,
    homeText: palette.textStrong,
  };
}
