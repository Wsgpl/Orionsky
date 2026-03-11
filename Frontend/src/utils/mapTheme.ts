import type { Theme } from "../types";

export type BasemapTileConfig = {
  basemap: string;
  basemap_day?: string;
  basemap_night?: string;
};

export function getThemeBasemapUrl(tiles: BasemapTileConfig, theme: Theme): string {
  if (theme === "night") {
    return tiles.basemap_night || tiles.basemap;
  }

  return tiles.basemap_day || tiles.basemap;
}
