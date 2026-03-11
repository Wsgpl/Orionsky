import { create } from "zustand";
import {
  Aircraft,
  WeatherCell,
  WeatherAdvisory,
  WeatherMode,
  Theme,
  ConnectionStatus,
} from "../types";

interface AppState {
  aircraft: Aircraft[];
  setAircraft: (aircraft: Aircraft[]) => void;
  aircraftMap: Map<string, Aircraft>;

  selectedIcao: string | null;
  setSelectedIcao: (icao: string | null) => void;
  selectedAircraft: Aircraft | null;

  weatherCells: WeatherCell[];
  setWeatherCells: (cells: WeatherCell[]) => void;
  weatherAdvisories: WeatherAdvisory[];
  setWeatherAdvisories: (advisories: WeatherAdvisory[]) => void;
  activeWeatherMode: WeatherMode;
  setWeatherMode: (mode: WeatherMode) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;
  manualTheme: boolean;
  setManualTheme: (value: boolean) => void;

  drawerOpen: boolean;
  setDrawerOpen: (value: boolean) => void;
  isLoading: boolean;
  setLoading: (value: boolean) => void;
  lastUpdated: Date | null;
  setLastUpdated: (value: Date) => void;
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useStore = create<AppState>((set, get) => ({
  aircraft: [],
  aircraftMap: new Map(),
  setAircraft: (aircraft) => {
    const aircraftMap = new Map(aircraft.map((item) => [item.icao, item]));
    const selectedIcao = get().selectedIcao;
    const selectedAircraft = selectedIcao ? (aircraftMap.get(selectedIcao) ?? null) : null;
    set({ aircraft, aircraftMap, selectedAircraft, lastUpdated: new Date() });
  },

  selectedIcao: null,
  selectedAircraft: null,
  setSelectedIcao: (icao) => {
    const selectedAircraft = icao ? (get().aircraftMap.get(icao) ?? null) : null;
    set({ selectedIcao: icao, selectedAircraft, drawerOpen: !!icao });
  },

  weatherCells: [],
  setWeatherCells: (weatherCells) => set({ weatherCells }),
  weatherAdvisories: [],
  setWeatherAdvisories: (weatherAdvisories) => set({ weatherAdvisories }),
  activeWeatherMode: "none",
  setWeatherMode: (activeWeatherMode) => set({ activeWeatherMode }),

  theme: "night",
  setTheme: (theme) => set({ theme }),
  manualTheme: false,
  setManualTheme: (manualTheme) => set({ manualTheme }),

  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  isLoading: true,
  setLoading: (isLoading) => set({ isLoading }),
  lastUpdated: null,
  setLastUpdated: (lastUpdated) => set({ lastUpdated }),
  connectionStatus: "connecting",
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
