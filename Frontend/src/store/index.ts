import { create } from "zustand";
import {
  AirQualityGridResponse,
  Aircraft,
  AircraftFilters,
  AuthSession,
  DisasterContextResponse,
  WeatherCell,
  WeatherAdvisory,
  WeatherMode,
  Theme,
  ConnectionStatus,
} from "../types";
import { readStoredSession, writeStoredSession } from "../utils/authSession";
import { enrichAircraftWithClassification } from "../utils/aircraftOperationalClassification";
import { enrichAircraftListWithRisk } from "../utils/aircraftRisk";
import { DEFAULT_AIRCRAFT_FILTERS } from "../utils/aircraftFilters";

interface AppState {
  aircraft: Aircraft[];
  setAircraft: (aircraft: Aircraft[]) => void;
  aircraftMap: Map<string, Aircraft>;
  aircraftFilters: AircraftFilters;
  setAircraftFilters: (filters: Partial<AircraftFilters>) => void;
  resetAircraftFilters: () => void;

  selectedIcao: string | null;
  setSelectedIcao: (icao: string | null) => void;
  selectedAircraft: Aircraft | null;

  selectedLocation: { id?: string; latitude: number; longitude: number; name: string; city?: string; iata?: string; icao?: string; kind?: string; state?: string } | null;
  setSelectedLocation: (loc: { id?: string; latitude: number; longitude: number; name: string; city?: string; iata?: string; icao?: string; kind?: string; state?: string } | null) => void;
  locationFocusToken: number;
  bumpLocationFocusToken: () => void;

  weatherCells: WeatherCell[];
  setWeatherCells: (cells: WeatherCell[]) => void;
  weatherLoading: boolean;
  setWeatherLoading: (value: boolean) => void;
  weatherAdvisories: WeatherAdvisory[];
  setWeatherAdvisories: (advisories: WeatherAdvisory[]) => void;
  activeWeatherMode: WeatherMode;
  setWeatherMode: (mode: WeatherMode) => void;
  airQualityGrid: AirQualityGridResponse | null;
  setAirQualityGrid: (grid: AirQualityGridResponse | null) => void;
  disasterContext: DisasterContextResponse | null;
  setDisasterContext: (context: DisasterContextResponse | null) => void;

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

  authSession: AuthSession | null;
  setAuthSession: (session: AuthSession | null) => void;
}

const initialSession = readStoredSession();

export const useStore = create<AppState>((set, get) => ({
  aircraft: [],
  aircraftMap: new Map(),
  aircraftFilters: DEFAULT_AIRCRAFT_FILTERS,
  setAircraft: (aircraft) => {
    const prevMap = get().aircraftMap;
    const classifiedAircraft = aircraft.map((ac) => {
      const existing = prevMap.get(ac.icao);
      if (existing?.classification) {
        return { ...ac, classification: existing.classification };
      }
      return enrichAircraftWithClassification(ac);
    });
    const enrichedAircraft = enrichAircraftListWithRisk(classifiedAircraft, get().weatherCells);
    const aircraftMap = new Map(enrichedAircraft.map((item) => [item.icao, item]));
    const selectedIcao = get().selectedIcao;
    const selectedAircraft = selectedIcao ? (aircraftMap.get(selectedIcao) ?? null) : null;
    set({ aircraft: enrichedAircraft, aircraftMap, selectedAircraft, lastUpdated: new Date() });
  },
  setAircraftFilters: (filters) => set({ aircraftFilters: { ...get().aircraftFilters, ...filters } }),
  resetAircraftFilters: () => set({ aircraftFilters: DEFAULT_AIRCRAFT_FILTERS }),

  selectedIcao: null,
  selectedAircraft: null,
  setSelectedIcao: (icao) => {
    const selectedAircraft = icao ? (get().aircraftMap.get(icao) ?? null) : null;
    set({ selectedIcao: icao, selectedAircraft, drawerOpen: !!icao });
  },

  selectedLocation: null,
  setSelectedLocation: (selectedLocation) => set({ selectedLocation }),
  locationFocusToken: 0,
  bumpLocationFocusToken: () => set((state) => ({ locationFocusToken: state.locationFocusToken + 1 })),

  weatherCells: [],
  weatherLoading: true,
  setWeatherCells: (weatherCells) => {
    const enrichedAircraft = enrichAircraftListWithRisk(get().aircraft, weatherCells);
    const aircraftMap = new Map(enrichedAircraft.map((item) => [item.icao, item]));
    const selectedIcao = get().selectedIcao;
    const selectedAircraft = selectedIcao ? (aircraftMap.get(selectedIcao) ?? null) : null;
    set({
      weatherCells,
      aircraft: enrichedAircraft,
      aircraftMap,
      selectedAircraft,
    });
  },
  setWeatherLoading: (weatherLoading) => set({ weatherLoading }),
  weatherAdvisories: [],
  setWeatherAdvisories: (weatherAdvisories) => set({ weatherAdvisories }),
  activeWeatherMode: "none",
  setWeatherMode: (activeWeatherMode) => set({ activeWeatherMode }),
  airQualityGrid: null,
  setAirQualityGrid: (airQualityGrid) => set({ airQualityGrid }),
  disasterContext: null,
  setDisasterContext: (disasterContext) => set({ disasterContext }),

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

  authSession: initialSession,
  setAuthSession: (authSession) => {
    writeStoredSession(authSession);
    set({ authSession });
  },
}));
