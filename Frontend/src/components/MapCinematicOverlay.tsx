import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const MAP_CINEMATIC_OVERLAY_PANE = "map-cinematic-overlay-pane";

function getOverlayBackground(theme: "day" | "night"): string {
  if (theme === "night") {
    return [
      "radial-gradient(ellipse at center, rgba(15, 23, 42, 0) 44%, rgba(2, 6, 23, 0.10) 74%, rgba(2, 6, 23, 0.22) 100%)",
      "linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0) 22%, rgba(2, 6, 23, 0.03) 64%, rgba(2, 6, 23, 0.10) 100%)",
    ].join(",");
  }

  return [
    "radial-gradient(ellipse at center, rgba(255, 255, 255, 0) 42%, rgba(15, 23, 42, 0.05) 76%, rgba(15, 23, 42, 0.14) 100%)",
    "linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0) 24%, rgba(15, 23, 42, 0.02) 68%, rgba(15, 23, 42, 0.07) 100%)",
  ].join(",");
}

function getOverlayShadow(theme: "day" | "night"): string {
  return theme === "night"
    ? "inset 0 0 140px rgba(2, 6, 23, 0.08)"
    : "inset 0 0 120px rgba(15, 23, 42, 0.05)";
}

export function MapCinematicOverlay({
  theme,
}: {
  theme: "day" | "night";
}) {
  const map = useMap();

  useEffect(() => {
    const pane = map.getPane(MAP_CINEMATIC_OVERLAY_PANE) ?? map.createPane(MAP_CINEMATIC_OVERLAY_PANE);
    pane.style.zIndex = "240";
    pane.style.pointerEvents = "none";

    const overlay =
      (pane.querySelector(".map-cinematic-overlay") as HTMLDivElement | null) ??
      L.DomUtil.create("div", "map-cinematic-overlay", pane);

    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.pointerEvents = "none";
    overlay.style.background = getOverlayBackground(theme);
    overlay.style.boxShadow = getOverlayShadow(theme);
    overlay.style.transition = "background 200ms ease, box-shadow 200ms ease";

    return () => {
      overlay.remove();
    };
  }, [map, theme]);

  return null;
}
