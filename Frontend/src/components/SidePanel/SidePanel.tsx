import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "../../services/api";
import { useStore } from "../../store";
import {
  type Aircraft,
  type AircraftFilters,
  type ApiKeyItem,
  type ApiKeySecretResponse,
  type DailyForecastItem,
  type ForecastResponse,
  type HealthLive,
  type HealthReady,
  type SnapshotResponse,
  type UsageReportResponse,
  type WeatherCell,
  type WeatherMode,
} from "../../types";
import {
  applyAircraftFilters,
  getAircraftTypeOptions,
} from "../../utils/aircraftFilters";
import { getAirlineInfo, getFlightNumber } from "../../utils/airline";
import { getFlightStatusLabel } from "../../utils/flightStatus";
import { countFlightsNearLocation, distanceKm } from "../../utils/indiaAirports";
import { formatWeatherValue, getNearestWeatherCell, getWeatherAlertLevel } from "../../utils/weatherMap";
import { WEATHER_LAYER_ACCENTS } from "../../utils/designSystem";
import { AviationDeskSection } from "./AviationDeskSection";
import { AirQualityDeskSection } from "./AirQualityDeskSection";
import { DisasterDeskSection } from "./DisasterDeskSection";
import { formatProviderLabel } from "./deskShared";

type Section = "weather" | "forecast" | "airQuality" | "disasters" | "traffic" | "aviation" | "operations" | "system" | "admin" | null;

type LocationTarget = {
  id?: string;
  latitude: number;
  longitude: number;
  name: string;
  city?: string;
  iata?: string;
  icao?: string;
  kind?: string;
  state?: string;
};

type FrontendConfigResponse = {
  map: {
    default_center: { lat: number; lon: number };
    default_zoom: number;
    weather_center: { lat: number; lon: number };
    weather_zoom: number;
    animation: {
      aircraft_duration: number;
      aircraft_steps: number;
      wind_particle_speed: number;
      wind_particles_count: number;
    };
  };
  airspace: {
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
  };
  weather: {
    grid_step: number;
    poll_interval: number;
    cache_ttl: number;
  };
};

const WX_BTNS: { mode: WeatherMode; icon: ReactNode; label: string; accent: string }[] = [
  { 
    mode: "temperature", 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>, 
    label: "Temperature", 
    accent: WEATHER_LAYER_ACCENTS.temperature 
  },
  { 
    mode: "wind", 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>, 
    label: "Wind Speed", 
    accent: WEATHER_LAYER_ACCENTS.wind 
  },
  { 
    mode: "precipitation", 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>, 
    label: "Rain/Snow", 
    accent: WEATHER_LAYER_ACCENTS.precipitation 
  },
  { 
    mode: "humidity", 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>, 
    label: "Humidity", 
    accent: WEATHER_LAYER_ACCENTS.humidity 
  },
  { 
    mode: "pressure", 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 3"/></svg>, 
    label: "Air Pressure", 
    accent: WEATHER_LAYER_ACCENTS.pressure 
  },
];

const API_KEY_PLANS = ["free", "pro", "enterprise"] as const;

export function SidePanel({ mode }: { mode: "radar" | "weather" }) {
  const [open, setOpen] = useState<Section>(null);
  const selectedLocation = useStore((s) => s.selectedLocation) as LocationTarget | null;
  const selectedIcao = useStore((s) => s.selectedIcao);
  const toggle = (section: Section) => setOpen((prev) => (prev === section ? null : section));

  useEffect(() => {
    if (mode === "radar" && selectedLocation?.kind === "airport") {
      setOpen("traffic");
    }
  }, [mode, selectedLocation?.id, selectedLocation?.kind]);

  return (
    <>
      {!open && (
        <aside className="planner-sidebar">
          {mode === "radar" && (
            <>
              <button 
                className="planner-toggle-btn"
                onClick={() => toggle("traffic")}
                title="Traffic Desk"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m4.93 4.93 14.14 14.14"/><path d="M2 12h20"/><path d="m19.07 4.93-14.14 14.14"/><circle cx="12" cy="12" r="8"/></svg>
              </button>
              <button 
                className="planner-toggle-btn"
                onClick={() => toggle("aviation")}
                title="Aviation Weather"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19c.7 0 1.3-.2 1.8-.7s.7-1.1.7-1.8c0-1.4-1.1-2.5-2.5-2.5-.1 0-.3 0-.4.1C16.5 11.5 14.5 9.5 12 9.5c-2.3 0-4.2 1.7-4.5 3.9-.3-.1-.6-.2-.9-.2-1.9 0-3.5 1.6-3.5 3.5s1.6 3.5 3.5 3.5h10.9z"/><path d="M12 2v3"/><path d="m4.93 4.93 2.12 2.12"/><path d="M2 12h3"/><path d="m4.93 19.07 2.12-2.12"/><path d="M12 19v3"/><path d="m17.07 17.07 2.12 2.12"/><path d="M19 12h3"/><path d="m17.07 6.93 2.12-2.12"/></svg>
              </button>
            </>
          )}
          {mode === "weather" && (
            <>
              <button 
                className="planner-toggle-btn"
                onClick={() => toggle("weather")}
                title="Weather Desk"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/><path d="M12 11v3"/></svg>
              </button>
              <button 
                className="planner-toggle-btn"
                onClick={() => toggle("forecast")}
                title="Forecast Desk"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </button>
              <button 
                className="planner-toggle-btn"
                onClick={() => toggle("airQuality")}
                title="Air Quality"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v4"/><path d="m9 7.13 3.62 3.63L16 7.13"/><path d="m2 12 5.4 5.4L11 12"/><path d="m16 13 4 4"/><path d="m20 13-4 4"/></svg>
              </button>
              <button 
                className="planner-toggle-btn"
                onClick={() => toggle("disasters")}
                title="Disasters"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3 2 6"/><path d="m2 3 3 3"/><path d="M22 3 19 6"/><path d="m19 3 3 3"/><path d="M5 21 2 18"/><path d="m2 21 3-3"/><path d="M22 21 19 18"/><path d="m19 21 3-3"/></svg>
              </button>
            </>
          )}
        </aside>
      )}

      {open && (
        <>
          {/* Only show menu back button if no aircraft detail drawer is covering the space */}
          {!selectedIcao && (
            <button 
              className="planner-toggle-btn"
              style={{ 
                position: "absolute", 
                right: "348px", /* Closer to the 320px sidebar + 14px spacing */
                top: "120px",
                zIndex: 800,
                background: "rgba(255, 255, 255, 0.45)", 
                color: "#0f172a",
                border: "1px solid rgba(255, 255, 255, 0.35)"
              }}
              onClick={() => {
                setOpen(null);
                // Also clear selected aircraft/location when going back to menu
                useStore.getState().setSelectedIcao(null);
              }}
              title="Back to Menu"
            >
              <svg 
                className="blinking-arrow-icon"
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </button>
          )}

          <div 
            className={`side-panel side-panel--${mode} side-panel--open`}
            style={{ right: "14px" }} /* Move to right when menu is hidden */
          >
            {mode === "weather" && (
              <>
                {open === "weather" && <WeatherSection open={true} onToggle={() => toggle("weather")} />}
                {open === "forecast" && <ForecastSection open={true} onToggle={() => toggle("forecast")} />}
                {open === "airQuality" && <AirQualityDeskSection open={true} onToggle={() => toggle("airQuality")} />}
                {open === "disasters" && <DisasterDeskSection open={true} onToggle={() => toggle("disasters")} />}
              </>
            )}
            {mode === "radar" && (
              <>
                {open === "traffic" && <TrafficSection open={true} onToggle={() => toggle("traffic")} />}
                {open === "aviation" && <AviationDeskSection open={true} onToggle={() => toggle("aviation")} />}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

function WeatherSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const mode = useStore((s) => s.activeWeatherMode);
  const setMode = useStore((s) => s.setWeatherMode);
  const weatherCells = useStore((s) => s.weatherCells);
  const advisories = useStore((s) => s.weatherAdvisories);

  const warmest = weatherCells.reduce<WeatherCell | null>(
    (best, cell) => (!best || cell.data.temperature > best.data.temperature ? cell : best),
    null
  );
  const strongestWind = weatherCells.reduce<WeatherCell | null>(
    (best, cell) => (!best || cell.data.wind_speed > best.data.wind_speed ? cell : best),
    null
  );

  return (
    <div className={`sp-section ${open ? "sp-section--open" : ""}`}>
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">WX</span>
        <span className="sp-header-label">Weather Desk</span>
        {mode !== "none" && <span className="sp-active-pip" />}
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body">
          <div className="sp-overview-grid">
            <OverviewTile label="Provider" value="Open-Meteo" />
            <OverviewTile label="Layer" value={mode === "none" ? "Off" : mode.toUpperCase()} />
            <OverviewTile label="Cells" value={String(weatherCells.length)} />
            <OverviewTile label="Alerts" value={String(advisories.length)} />
            <OverviewTile label="Warmest" value={warmest ? `${Math.round(warmest.data.temperature)} C` : "Unavailable"} />
            <OverviewTile label="Wind Max" value={strongestWind ? `${Math.round(strongestWind.data.wind_speed)} m/s` : "Unavailable"} />
          </div>

          <div className="sp-wx-grid sp-wx-grid--dashboard">
            {WX_BTNS.map((button) => {
              const active = mode === button.mode;
              return (
                <button
                  type="button"
                  key={button.mode}
                  className={`sp-wx-btn ${active ? "sp-wx-btn--active" : ""}`}
                  style={{ "--wx-accent": button.accent } as CSSProperties}
                  aria-pressed={active}
                  onClick={() => setMode(mode === button.mode ? "none" : button.mode)}
                >
                  <span className="sp-wx-icon">{button.icon}</span>
                  <span className="sp-wx-label">{button.label}</span>
                </button>
              );
            })}
          </div>

          <div className="sp-text-block">
            <div className="sp-subtitle">What this panel shows</div>
            <p>
              Weather overlays stay on the same India map. Forecast, backend status, and API admin tools now live in
              this same panel without changing the layout.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ForecastSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const selectedLocation = useStore((s) => s.selectedLocation) as LocationTarget | null;
  const selectedAircraft = useStore((s) => s.selectedAircraft);
  const [query, setQuery] = useState("");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectionLabel = selectedLocation
    ? `${selectedLocation.name} - map selection`
    : selectedAircraft
      ? `${getFlightNumber(selectedAircraft.callsign)} - selected aircraft`
      : "Nothing selected";

  useEffect(() => {
    if (!selectedLocation || query.trim()) {
      return;
    }
    setQuery(selectedLocation.name);
  }, [query, selectedLocation]);

  const runQueryLookup = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Enter a place to request forecast data.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.getForecast({ query: trimmed });
      setForecast(response);
    } catch (err) {
      setError(getErrorMessage(err, "Forecast lookup failed."));
    } finally {
      setLoading(false);
    }
  };

  const runSelectionLookup = async () => {
    const target = selectedLocation
      ? { lat: selectedLocation.latitude, lon: selectedLocation.longitude }
      : selectedAircraft
        ? { lat: selectedAircraft.latitude, lon: selectedAircraft.longitude }
        : null;

    if (!target) {
      setError("Select a location or aircraft first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.getForecast(target);
      setForecast(response);
    } catch (err) {
      setError(getErrorMessage(err, "Forecast lookup failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`sp-section ${open ? "sp-section--open" : ""}`}>
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">FC</span>
        <span className="sp-header-label">Forecast Desk</span>
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body">
          <div className="sp-text-block">
            <div className="sp-subtitle">Lookup target</div>
            <p>{selectionLabel}</p>
          </div>

          <div className="sp-form-grid">
            <input
              className="sp-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="City, airport, or area query"
            />
            <div className="sp-action-row">
              <button type="button" className="sp-btn" onClick={() => void runQueryLookup()} disabled={loading}>
                {loading ? "WAIT" : "QUERY"}
              </button>
              <button type="button" className="sp-btn sp-btn--ghost" onClick={() => void runSelectionLookup()} disabled={loading}>
                USE SEL
              </button>
            </div>
          </div>

          {error && <InlineNotice tone="danger" message={error} />}

          {forecast && (
            <>
              <div className="sp-overview-grid">
                <OverviewTile label="Source" value={formatProviderLabel(forecast.source)} />
                <OverviewTile
                  label="Current"
                  value={forecast.current ? `${Math.round(forecast.current.temperature)} C` : "Unavailable"}
                />
                <OverviewTile label="Daily" value={String(forecast.daily.length)} />
              </div>

              {forecast.current && (
                <div className="sp-data-grid">
                  <DataCard label="Condition" value={forecast.current.condition ?? "Unavailable"} />
                  <DataCard label="Humidity" value={`${Math.round(forecast.current.humidity)}%`} />
                  <DataCard label="Wind" value={`${Math.round(forecast.current.wind_speed)} m/s`} />
                  <DataCard label="Pressure" value={`${Math.round(forecast.current.pressure)} hPa`} />
                </div>
              )}

              {forecast.hourly.length > 0 && (
                <div className="sp-list-block">
                  <div className="sp-subtitle">Next Hours</div>
                  {forecast.hourly.slice(0, 5).map((item) => (
                    <ForecastRow
                      key={item.time}
                      title={formatShortDateTime(item.time)}
                      value={formatForecastTemp(item.temperature)}
                      meta={[
                        item.condition ?? "Unavailable",
                        item.wind_speed !== null ? `${Math.round(item.wind_speed)} m/s` : null,
                        item.precipitation_probability !== null ? `${Math.round(item.precipitation_probability)}% precip` : null,
                      ]}
                    />
                  ))}
                </div>
              )}

              {forecast.daily.length > 0 && (
                <div className="sp-list-block">
                  <div className="sp-subtitle">Daily Outlook</div>
                  {forecast.daily.slice(0, 4).map((item) => (
                    <DailyForecastRow key={item.date} item={item} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TrafficSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const aircraft = useStore((s) => s.aircraft);
  const aircraftFilters = useStore((s) => s.aircraftFilters);
  const setAircraftFilters = useStore((s) => s.setAircraftFilters);
  const resetAircraftFilters = useStore((s) => s.resetAircraftFilters);
  const selectedIcao = useStore((s) => s.selectedIcao);
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);
  const selectedLocation = useStore((s) => s.selectedLocation) as LocationTarget | null;
  const setSelectedLocation = useStore((s) => s.setSelectedLocation);
  const weatherCells = useStore((s) => s.weatherCells);
  const selectedAirport = selectedLocation?.kind === "airport" ? selectedLocation : null;
  const filteredAircraft = useMemo(
    () => applyAircraftFilters(aircraft, aircraftFilters),
    [aircraft, aircraftFilters],
  );
  const aircraftTypeOptions = useMemo(
    () => getAircraftTypeOptions(aircraft),
    [aircraft],
  );
  
  const carrierCount = useMemo(() => new Set(aircraft.map((item) => getAirlineInfo(item.callsign).airline)).size, [aircraft]);
  const activeFilterCount =
    Number(aircraftFilters.altitudeMin !== null) +
    Number(aircraftFilters.altitudeMax !== null) +
    Number(aircraftFilters.speedMin !== null) +
    Number(aircraftFilters.aircraftType !== "all");

  const locationFlights = selectedLocation 
    ? filteredAircraft.filter(item => distanceKm(item.latitude, item.longitude, selectedLocation.latitude, selectedLocation.longitude) <= 50)
    : filteredAircraft;

  const filtered = locationFlights
    .sort((a, b) => {
      if (a.on_ground !== b.on_ground) return Number(a.on_ground) - Number(b.on_ground);
      return b.altitude - a.altitude;
    });

  const spotlight = filtered.slice(0, 6);

  return (
    <div className={`sp-section sp-section--traffic ${open ? "sp-section--open" : ""}`}>
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">TRF</span>
        <span className="sp-header-label">Traffic Desk</span>
        <span className="sp-count-badge sp-count-badge--blue">{filteredAircraft.length}</span>
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body sp-body--traffic">
          {selectedAirport && (
            <AirportDetailPanel
              airport={selectedAirport}
              aircraft={aircraft}
              weatherCells={weatherCells}
              onClear={() => setSelectedLocation(null)}
            />
          )}

          <div className="sp-form-grid">
            <div className="sp-text-block">
              <div className="sp-subtitle">Radar Filters</div>
              <p>Refine the live radar by altitude, minimum speed, and target type. The map updates instantly.</p>
            </div>

            <div className="sp-filter-grid">
              <input
                className="sp-input"
                type="number"
                min="0"
                step="1000"
                placeholder="Min altitude (ft)"
                value={aircraftFilters.altitudeMin ?? ""}
                onChange={(event) => setAircraftFilters({ altitudeMin: parseFilterNumber(event.target.value) })}
              />
              <input
                className="sp-input"
                type="number"
                min="0"
                step="1000"
                placeholder="Max altitude (ft)"
                value={aircraftFilters.altitudeMax ?? ""}
                onChange={(event) => setAircraftFilters({ altitudeMax: parseFilterNumber(event.target.value) })}
              />
            </div>

            <input
              className="sp-input"
              type="number"
              min="0"
              step="25"
              placeholder="Min speed (km/h)"
              value={aircraftFilters.speedMin ?? ""}
              onChange={(event) => setAircraftFilters({ speedMin: parseFilterNumber(event.target.value) })}
            />

            <select
              className="sp-select"
              value={aircraftFilters.aircraftType}
              onChange={(event) => setAircraftFilters({ aircraftType: event.target.value })}
            >
              <option value="all">All aircraft types</option>
              {aircraftTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <div className="sp-action-row">
              <span className="sp-inline-badge">{filteredAircraft.length} visible on map</span>
              {activeFilterCount > 0 && <span className="sp-inline-badge sp-inline-badge--muted">{activeFilterCount} filters active</span>}
              <button
                type="button"
                className="sp-btn sp-btn--ghost"
                onClick={resetAircraftFilters}
                disabled={activeFilterCount === 0}
              >
                RESET FILTERS
              </button>
            </div>
          </div>

          <div className="sp-text-block sp-text-block--compact">
            <div className="sp-subtitle">Spotlight flights</div>
          </div>

          <div className="sp-traffic-list">
            {spotlight.map((item) => (
              <TrafficRow
                key={item.icao}
                aircraft={item}
                onSelect={setSelectedIcao}
                isSelected={selectedIcao === item.icao}
                featured
              />
            ))}
          </div>

          <div className="sp-text-block sp-text-block--compact">
            <div className="sp-subtitle">
              {selectedLocation ? `Flights near ${selectedLocation.name}` : "All tracked targets"}
            </div>
          </div>

          <div className="sp-ac-list">
            {filtered.slice(0, 36).map((item) => (
              <TrafficRow
                key={item.icao}
                aircraft={item}
                onSelect={setSelectedIcao}
                isSelected={selectedIcao === item.icao}
              />
            ))}
            {filtered.length > 36 && <div className="sp-more">+{filtered.length - 36} more flights in the feed</div>}
          </div>

          <div className="sp-text-block">
            <div className="sp-subtitle">Coverage</div>
            <p>{carrierCount} airlines are color-coded on the shared map layer across domestic and international traffic.</p>
          </div>
        </div>
      )}
    </div>
  );
}



function AirportDetailPanel({
  airport,
  aircraft,
  weatherCells,
  onClear,
}: {
  airport: LocationTarget;
  aircraft: Aircraft[];
  weatherCells: WeatherCell[];
  onClear: () => void;
}) {
  const airportWeather = useMemo(
    () => getNearestWeatherCell(weatherCells, airport.latitude, airport.longitude),
    [airport.latitude, airport.longitude, weatherCells],
  );
  const weatherAlert = airportWeather ? getWeatherAlertLevel(airportWeather) : null;
  const nearbyTraffic = useMemo(
    () => countFlightsNearLocation(aircraft, airport.latitude, airport.longitude, 60),
    [aircraft, airport.latitude, airport.longitude],
  );

  return (
    <div className="sp-list-block">
      <div className="sp-action-row">
        <span className="sp-inline-badge">{airport.iata ?? airport.icao ?? "AIR"}</span>
        {airport.state && <span className="sp-inline-badge sp-inline-badge--muted">{airport.state}</span>}
        <button type="button" className="sp-btn sp-btn--ghost" onClick={onClear}>
          CLEAR
        </button>
      </div>

      <div className="sp-text-block sp-text-block--compact">
        <div className="sp-subtitle">Airport Detail</div>
        <p>
          {airport.name}
          {airport.city ? ` - ${airport.city}` : ""}
        </p>
      </div>

      <div className="sp-overview-grid">
        <OverviewTile label="Arrivals" value="N/A" />
        <OverviewTile label="Departures" value="N/A" />
        <OverviewTile label="Nearby" value={String(nearbyTraffic)} />
        <OverviewTile label="Weather" value={airportWeather?.data.condition ?? "Unavailable"} />
      </div>

      <div className="sp-list-block">
        <div className="sp-subtitle">Weather At Airport</div>
        {airportWeather ? (
          <>
            <StatusRow
              label="Condition"
              value={airportWeather.data.condition ?? "Unavailable"}
              tone={weatherAlert === "red" ? "danger" : weatherAlert === "orange" ? "warning" : "neutral"}
            />
            <StatusRow
              label="Temperature"
              value={formatWeatherValue("temperature", airportWeather.data.temperature)}
            />
            <StatusRow
              label="Wind"
              value={formatWeatherValue("wind", airportWeather.data.wind_speed)}
              tone={weatherAlert === "red" ? "danger" : weatherAlert === "orange" ? "warning" : "neutral"}
            />
            <StatusRow
              label="Humidity"
              value={formatWeatherValue("humidity", airportWeather.data.humidity)}
            />
            <StatusRow
              label="Pressure"
              value={formatWeatherValue("pressure", airportWeather.data.pressure)}
            />
          </>
        ) : (
          <div className="sp-more">No live weather cell is currently close to this airport.</div>
        )}
      </div>

      <div className="sp-list-block">
        <div className="sp-subtitle">Arrivals</div>
        <div className="sp-more">Arrival data unavailable.</div>
      </div>

      <div className="sp-list-block">
        <div className="sp-subtitle">Departures</div>
        <div className="sp-more">Departure data unavailable.</div>
      </div>
    </div>
  );
}





function TrafficRow({
  aircraft,
  onSelect,
  isSelected = false,
  featured = false,
}: {
  aircraft: Aircraft;
  onSelect: (icao: string | null) => void;
  isSelected?: boolean;
  featured?: boolean;
}) {
  const airline = getAirlineInfo(aircraft.callsign).airline;
  const airlineColor = getAirlineInfo(aircraft.callsign).color;
  const flightNo = getFlightNumber(aircraft.callsign);
  const phase = getFlightStatusLabel(aircraft);

  return (
    <div
      className={`sp-ac-row ${featured ? "sp-ac-row--featured" : ""} ${isSelected ? "sp-ac-row--selected" : ""}`}
      style={{ borderLeft: `4px solid ${airlineColor}` }}
      onClick={() => onSelect(aircraft.icao)}
    >
      <div className="sp-ac-id">
        <button
          type="button"
          className="sp-ac-cs-btn"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(aircraft.icao);
          }}
        >
          <span className="sp-ac-cs">{flightNo}</span>
        </button>
        <span className="sp-ac-hex">{airline} - {(aircraft.callsign ?? aircraft.icao).trim()} - {aircraft.icao}</span>
      </div>
      <div className="sp-ac-data sp-ac-data--stack">
        <span>{aircraft.altitude > 100 ? `FL${Math.round(aircraft.altitude / 100)}` : "GND"}</span>
        <span>{Math.round(aircraft.velocity)} km/h</span>
        <span>{phase}</span>
      </div>
    </div>
  );
}

function OverviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="sp-overview-tile">
      <span className="sp-overview-label">{label}</span>
      <span className="sp-overview-value">{value}</span>
    </div>
  );
}

function parseFilterNumber(value: string): AircraftFilters["altitudeMin"] {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, parsed);
}

function DataCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="sp-data-card">
      <span className="sp-overview-label">{label}</span>
      <span className="sp-overview-value">{value}</span>
    </div>
  );
}

function ForecastRow({
  title,
  value,
  meta,
}: {
  title: string;
  value: string;
  meta: Array<string | null>;
}) {
  return (
    <div className="sp-status-row">
      <div>
        <div className="sp-status-row__label">{title}</div>
        <div className="sp-status-row__meta">{meta.filter(Boolean).join(" - ")}</div>
      </div>
      <div className="sp-status-row__value">{value}</div>
    </div>
  );
}

function DailyForecastRow({ item }: { item: DailyForecastItem }) {
  return (
    <ForecastRow
      title={formatShortDate(item.date)}
      value={`${formatForecastTemp(item.temp_min)} / ${formatForecastTemp(item.temp_max)}`}
      meta={[
        item.condition ?? "Unavailable",
        item.wind_speed !== null ? `${Math.round(item.wind_speed)} m/s` : null,
        item.precipitation_probability !== null ? `${Math.round(item.precipitation_probability)}% precip` : null,
      ]}
    />
  );
}

function StatusRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div className={`sp-status-row sp-status-row--${tone}`}>
      <div className="sp-status-row__label">{label}</div>
      <div className="sp-status-row__value">{value}</div>
    </div>
  );
}

function InlineNotice({
  tone,
  message,
}: {
  tone: "danger" | "info";
  message: string;
}) {
  return <div className={`sp-inline-notice sp-inline-notice--${tone}`}>{message}</div>;
}

function buildCircuitRows(ready: HealthReady): Array<{ label: string; value: string; tone: "success" | "warning" | "danger" }> {
  return [
    { label: "Redis", value: ready.redis, tone: ready.redis === "ok" ? "success" : "danger" },
    { label: "OpenSky", value: ready.opensky_circuit, tone: toneFromState(ready.opensky_circuit) },
    { label: "Open-Meteo", value: ready.openmeteo_circuit, tone: toneFromState(ready.openmeteo_circuit) },
    { label: "ADSB.lol", value: ready.adsblol_circuit ?? "n/a", tone: toneFromState(ready.adsblol_circuit ?? "n/a") },
    {
      label: "ICAO Aircraft",
      value: ready.icao_aircraft_circuit ?? "n/a",
      tone: toneFromState(ready.icao_aircraft_circuit ?? "n/a"),
    },
  ];
}

function toneFromState(value: string): "success" | "warning" | "danger" {
  if (value === "ok" || value === "closed") {
    return "success";
  }
  if (value === "half_open") {
    return "warning";
  }
  return "danger";
}

function parseMetricsPreview(raw: string): Array<{ label: string; value: string }> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .slice(0, 8)
    .map((line) => {
      const parts = line.split(/\s+/);
      const value = parts.pop() ?? "";
      return { label: parts.join(" "), value };
    });
}

function formatShortDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", weekday: "short" });
}

function formatForecastTemp(value: number | null): string {
  return value === null ? "Unavailable" : `${Math.round(value)} C`;
}

function getErrorMessage(error: unknown, fallback: string): string {
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
