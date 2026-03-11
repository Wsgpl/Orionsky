import { useMemo, useState, type CSSProperties } from "react";
import { useStore } from "../../store";
import { WeatherMode, type Aircraft, type WeatherCell } from "../../types";
import { aircraftSearchText, getAirlineInfo, getFlightNumber } from "../../utils/airline";

type Section = "weather" | "traffic" | "operations" | null;

const WX_BTNS: { mode: WeatherMode; icon: string; label: string; accent: string }[] = [
  { mode: "temperature", icon: "TMP", label: "Temperature", accent: "#f4793a" },
  { mode: "wind", icon: "WND", label: "Wind", accent: "#42a5f5" },
  { mode: "precipitation", icon: "PRC", label: "Precipitation", accent: "#4a90e2" },
  { mode: "humidity", icon: "HUM", label: "Humidity", accent: "#4caf50" },
  { mode: "pressure", icon: "PRS", label: "Pressure", accent: "#26c6da" },
];

export function SidePanel({ mode }: { mode: "radar" | "weather" }) {
  const [open, setOpen] = useState<Section>(mode === "weather" ? "weather" : "traffic");
  const toggle = (section: Section) => setOpen((prev) => (prev === section ? null : section));

  return (
    <div className="side-panel">
      {mode === "weather" && <WeatherSection open={open === "weather"} onToggle={() => toggle("weather")} />}
      {mode === "radar" && <TrafficSection open={open === "traffic"} onToggle={() => toggle("traffic")} />}
      <OperationsSection open={open === "operations"} onToggle={() => toggle("operations")} />
    </div>
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
    <div className="sp-section">
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">WX</span>
        <span className="sp-header-label">Weather Desk</span>
        {mode !== "none" && <span className="sp-active-pip" />}
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body">
          <div className="sp-overview-grid">
            <OverviewTile label="Layer" value={mode === "none" ? "Off" : mode.toUpperCase()} />
            <OverviewTile label="Cells" value={String(weatherCells.length)} />
            <OverviewTile label="Alerts" value={String(advisories.length)} />
            <OverviewTile label="Warmest" value={warmest ? `${Math.round(warmest.data.temperature)} C` : "NA"} />
            <OverviewTile label="Wind Max" value={strongestWind ? `${Math.round(strongestWind.data.wind_speed)} m/s` : "NA"} />
          </div>

          <div className="sp-wx-grid sp-wx-grid--dashboard">
            {WX_BTNS.map((button) => {
              const active = mode === button.mode;
              return (
                <button
                  key={button.mode}
                  className={`sp-wx-btn ${active ? "sp-wx-btn--active" : ""}`}
                  style={{ "--wx-accent": button.accent } as CSSProperties}
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
              Weather overlays stay on the same India traffic map. Aircraft remain visible above the animated weather
              field so you can read route flow and local conditions together.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TrafficSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const aircraft = useStore((s) => s.aircraft);
  const selectedIcao = useStore((s) => s.selectedIcao);
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);
  const [search, setSearch] = useState("");
  const carrierCount = useMemo(() => new Set(aircraft.map((item) => getAirlineInfo(item.callsign).airline)).size, [aircraft]);

  const filtered = aircraft
    .filter((item) => {
      const query = search.toLowerCase();
      return !query || aircraftSearchText(item).includes(query);
    })
    .sort((a, b) => {
      if (a.on_ground !== b.on_ground) return Number(a.on_ground) - Number(b.on_ground);
      return b.altitude - a.altitude;
    });

  const spotlight = filtered.filter((item) => !item.on_ground).slice(0, 6);

  return (
    <div className="sp-section">
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">TRF</span>
        <span className="sp-header-label">Traffic Desk</span>
        <span className="sp-count-badge sp-count-badge--blue">{aircraft.length}</span>
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body">
          <div className="sp-search-wrap">
            <span className="sp-search-icon">FIND</span>
            <input
              className="sp-search"
              placeholder="Search flight, callsign, ICAO, airline"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && <button className="sp-search-clear" onClick={() => setSearch("")}>CLR</button>}
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
            <div className="sp-subtitle">All tracked aircraft</div>
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

function OperationsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const aircraft = useStore((s) => s.aircraft);
  const weatherCells = useStore((s) => s.weatherCells);
  const airborne = aircraft.filter((item) => !item.on_ground).length;
  const arrivingLeaving = aircraft.filter((item) => !item.on_ground && item.altitude < 5000).length;
  const weatherSignals = weatherCells.filter((cell) => {
    const condition = cell.data.condition.toLowerCase();
    return condition.includes("rain") || condition.includes("storm") || condition.includes("cloud");
  }).length;

  return (
    <div className="sp-section">
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">OPS</span>
        <span className="sp-header-label">Operations</span>
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body">
          <div className="sp-overview-grid">
            <OverviewTile label="Airborne" value={String(airborne)} />
            <OverviewTile label="Low Alt" value={String(arrivingLeaving)} />
            <OverviewTile label="WX Cells" value={String(weatherSignals)} />
          </div>

          <div className="sp-text-block">
            <div className="sp-subtitle">Map behavior</div>
            <p>Aircraft symbols stay above every weather mode. Clicking a weather region opens only regional weather data, not a region flight list.</p>
          </div>
        </div>
      )}
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
  const phase = aircraft.on_ground ? "Ground" : aircraft.altitude < 5000 ? "Arrival / Departure" : "En route";

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
