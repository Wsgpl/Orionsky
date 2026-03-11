import type { ReactNode } from "react";
import { useStore } from "../../store";
import { compassPoint, flightLevel, formatCoord } from "../../utils/mapHelpers";
import { getAirlineInfo, getFlightNumber } from "../../utils/airline";

export function DetailDrawer() {
  const selectedAircraft = useStore((s) => s.selectedAircraft);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);
  const advisories = useStore((s) => s.weatherAdvisories);
  const weatherCells = useStore((s) => s.weatherCells);

  if (!selectedAircraft) {
    return <div className={`detail-drawer ${drawerOpen ? "detail-drawer--open" : ""}`} />;
  }

  const aircraft = selectedAircraft;
  const advisory = advisories.find((item) => item.aircraft === aircraft.icao);
  const airline = getAirlineInfo(aircraft.callsign).airline;
  const flightNo = getFlightNumber(aircraft.callsign);

  const nearestWeather =
    weatherCells.length > 0
      ? weatherCells.reduce((best, cell) => {
          const distance = Math.hypot(cell.data.latitude - aircraft.latitude, cell.data.longitude - aircraft.longitude);
          const bestDistance = Math.hypot(best.data.latitude - aircraft.latitude, best.data.longitude - aircraft.longitude);
          return distance < bestDistance ? cell : best;
        })
      : null;

  const weatherRisk = advisory ? (advisory.severity === "HIGH" ? 95 : advisory.severity === "MEDIUM" ? 60 : 25) : 0;
  const icingRisk =
    aircraft.altitude > 18000 && nearestWeather && nearestWeather.data.temperature < 2
      ? Math.min(90, 40 + (2 - nearestWeather.data.temperature) * 5)
      : nearestWeather && nearestWeather.data.temperature < 0
        ? 20
        : 5;
  const overallRisk = Math.max(weatherRisk, icingRisk);

  return (
    <div className={`detail-drawer ${drawerOpen ? "detail-drawer--open" : ""}`}>
      <div className="drawer-header">
        <div className="drawer-ac-identity">
          <div className="drawer-plane-glyph">
            <svg
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
              style={{ transform: `rotate(${aircraft.heading}deg)`, transition: "transform 0.4s ease" }}
            >
              <path d="M20 2 L25 20 L20 17 L15 20 Z" fill="currentColor" />
              <path d="M10 22 L20 18 L30 22 L28 25 L20 22 L12 25 Z" fill="currentColor" opacity="0.6" />
              <path d="M15 30 L20 27 L25 30 L24 33 L20 31 L16 33 Z" fill="currentColor" opacity="0.4" />
            </svg>
          </div>
          <div className="drawer-ac-info">
            <div className="drawer-callsign">{flightNo}</div>
            <div className="drawer-icao-hex">{airline}</div>
            <div className="drawer-icao-hex">{(aircraft.callsign ?? aircraft.icao).trim()} - {aircraft.icao}</div>
            <div className="drawer-status-pill">
              {aircraft.on_ground ? <span className="pill pill--ground">ON GROUND</span> : <span className="pill pill--airborne">AIRBORNE</span>}
              {advisory && <span className={`pill pill--wx-${advisory.severity.toLowerCase()}`}>{advisory.severity} WX</span>}
            </div>
          </div>
        </div>

        <div className="drawer-risk-gauge">
          <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60">
            <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
            <circle
              cx="30"
              cy="30"
              r="26"
              stroke={overallRisk > 70 ? "#ff3333" : overallRisk > 40 ? "#ff8800" : "#00ff88"}
              strokeWidth="5"
              strokeDasharray={`${(overallRisk / 100) * 163.4} 163.4`}
              strokeLinecap="round"
              transform="rotate(-90 30 30)"
            />
            <text x="30" y="33" textAnchor="middle" fontSize="13" fontFamily="Share Tech Mono" fill="white" fontWeight="700">
              {overallRisk}
            </text>
          </svg>
          <span className="risk-gauge-label">RISK</span>
        </div>

        <button className="drawer-close-btn" onClick={() => setSelectedIcao(null)} aria-label="Close">
          X
        </button>
      </div>

      <div className="drawer-body">
        <DrawerSection title="ALTITUDE">
          <AltitudeCard altitude={aircraft.altitude} />
        </DrawerSection>

        <DrawerSection title="FLIGHT TELEMETRY">
          <div className="data-grid">
            <DataCell label="GROUND SPEED" value={`${Math.round(aircraft.velocity)}`} unit="km/h" />
            <DataCell label="HEADING" value={`${Math.round(aircraft.heading)} deg`} sub={compassPoint(aircraft.heading)} />
            <DataCell
              label="FLIGHT PHASE"
              value={
                aircraft.on_ground ? "GROUND" : aircraft.altitude < 5000 ? "TAKEOFF/LANDING" : aircraft.altitude < 20000 ? "CLIMBING" : "CRUISE"
              }
            />
          </div>
        </DrawerSection>

        <DrawerSection title="POSITION">
          <div className="data-grid data-grid--2">
            <DataCell label="LATITUDE" value={formatCoord(aircraft.latitude, "lat")} />
            <DataCell label="LONGITUDE" value={formatCoord(aircraft.longitude, "lon")} />
          </div>
        </DrawerSection>

        {nearestWeather && (
          <DrawerSection title="WEATHER AT LOCATION">
            <div className="data-grid">
              <DataCell label="TEMPERATURE" value={`${nearestWeather.data.temperature.toFixed(1)} C`} />
              <DataCell
                label="WIND"
                value={`${nearestWeather.data.wind_speed.toFixed(1)} m/s`}
                sub={`${Math.round(nearestWeather.data.wind_direction)} deg ${compassPoint(nearestWeather.data.wind_direction)}`}
              />
              <DataCell label="VISIBILITY" value={`${(nearestWeather.data.visibility / 1000).toFixed(1)} km`} />
              <DataCell label="CLOUD COVER" value={`${Math.round(nearestWeather.data.cloud_cover)}%`} />
              <DataCell label="HUMIDITY" value={`${Math.round(nearestWeather.data.humidity)}%`} />
              <DataCell label="PRESSURE" value={`${Math.round(nearestWeather.data.pressure)} hPa`} />
            </div>
          </DrawerSection>
        )}

        <DrawerSection title="RISK ASSESSMENT">
          <RiskBar
            label="WEATHER RISK"
            value={weatherRisk}
            color={weatherRisk > 70 ? "#ff3333" : weatherRisk > 40 ? "#ff8800" : "#00ff88"}
            status={weatherRisk > 70 ? "SEVERE" : weatherRisk > 40 ? "MODERATE" : "CLEAR"}
          />
          <RiskBar
            label="ICING RISK"
            value={icingRisk}
            color={icingRisk > 60 ? "#42a5f5" : icingRisk > 30 ? "#90caf9" : "#00ff88"}
            status={icingRisk > 60 ? "HIGH" : icingRisk > 20 ? "MODERATE" : "LOW"}
          />
        </DrawerSection>
      </div>

      <div className="drawer-footer">
        <span>AEROINTEL - {aircraft.icao}</span>
        <span>{new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</span>
      </div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">{title}</div>
      {children}
    </div>
  );
}

function DataCell({
  label,
  value,
  unit,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`data-cell ${highlight ? "data-cell--highlight" : ""}`}>
      <div className="data-cell-label">{label}</div>
      <div className="data-cell-value">
        {value}
        {unit && <span className="data-cell-unit"> {unit}</span>}
      </div>
      {sub && <div className="data-cell-sub">{sub}</div>}
    </div>
  );
}

function AltitudeCard({ altitude }: { altitude: number }) {
  return (
    <div className="altitude-card">
      <div className="altitude-card-left">
        <div className="altitude-card-label">FLIGHT LEVEL</div>
        <div className="altitude-card-fl">{flightLevel(altitude)}</div>
      </div>
      <div className="altitude-card-right">
        <div className="altitude-card-label">ALTITUDE</div>
        <div className="altitude-card-ft">{Math.round(altitude).toLocaleString()} ft</div>
      </div>
    </div>
  );
}

function RiskBar({
  label,
  value,
  color,
  status,
}: {
  label: string;
  value: number;
  color: string;
  status: string;
}) {
  return (
    <div className="risk-bar">
      <div className="risk-bar-header">
        <span className="risk-bar-label">{label}</span>
        <span className="risk-bar-status" style={{ color }}>
          {status}
        </span>
      </div>
      <div className="risk-bar-track">
        <div
          className="risk-bar-fill"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}
