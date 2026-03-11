import { useStore } from "../../store";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function OverviewDock() {
  const aircraft = useStore((s) => s.aircraft);
  const weatherCells = useStore((s) => s.weatherCells);
  const weatherAdvisories = useStore((s) => s.weatherAdvisories);
  const activeWeatherMode = useStore((s) => s.activeWeatherMode);
  const connectionStatus = useStore((s) => s.connectionStatus);

  const airborne = aircraft.filter((item) => !item.on_ground);
  const avgAltitude = average(airborne.map((item) => item.altitude));
  const avgSpeed = average(airborne.map((item) => item.velocity));
  const hottest = weatherCells.reduce<typeof weatherCells[number] | null>(
    (best, cell) => (!best || cell.data.temperature > best.data.temperature ? cell : best),
    null
  );
  const windiest = weatherCells.reduce<typeof weatherCells[number] | null>(
    (best, cell) => (!best || cell.data.wind_speed > best.data.wind_speed ? cell : best),
    null
  );
  const avgHumidity = average(weatherCells.map((cell) => cell.data.humidity));

  return (
    <div className="overview-dock">
      <section className="overview-card">
        <div className="overview-label">Traffic Picture</div>
        <div className="overview-value">{aircraft.length}</div>
        <div className="overview-meta">tracked aircraft</div>
        <div className="overview-grid">
          <Metric label="Airborne" value={String(airborne.length)} />
          <Metric label="Avg FL" value={airborne.length ? `FL${Math.round(avgAltitude / 100)}` : "NA"} />
          <Metric label="Avg Speed" value={airborne.length ? `${Math.round(avgSpeed)} km/h` : "NA"} />
        </div>
      </section>

      <section className="overview-card">
        <div className="overview-label">Weather Field</div>
        <div className="overview-value">{weatherCells.length}</div>
        <div className="overview-meta">cells in cache</div>
        <div className="overview-grid">
          <Metric
            label="Layer"
            value={activeWeatherMode === "none" ? "Off" : activeWeatherMode.toUpperCase()}
          />
          <Metric
            label="Hottest"
            value={hottest ? `${Math.round(hottest.data.temperature)} C` : "NA"}
          />
          <Metric
            label="Wind Max"
            value={windiest ? `${Math.round(windiest.data.wind_speed)} m/s` : "NA"}
          />
          <Metric label="Humidity" value={weatherCells.length ? `${Math.round(avgHumidity)}%` : "NA"} />
        </div>
      </section>

      <section className="overview-card overview-card--system">
        <div className="overview-label">Operations</div>
        <div className="overview-value">{connectionStatus.toUpperCase()}</div>
        <div className="overview-meta">client link state</div>
        <div className="overview-grid">
          <Metric label="WX Alerts" value={String(weatherAdvisories.length)} />
          <Metric label="Coverage" value={weatherCells.length ? "Live" : "Cold"} />
          <Metric label="Focus" value="India FIR" />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="overview-metric">
      <span className="overview-metric-label">{label}</span>
      <span className="overview-metric-value">{value}</span>
    </div>
  );
}
