import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useStore } from "../../store";
import type {
  AviationAlertData,
  AviationAlertResponse,
  AviationForecastData,
  AviationForecastResponse,
  AviationMetarResponse,
} from "../../types";
import {
  formatProviderLabel,
  formatShortDateTime,
  getErrorMessage,
  InlineNotice,
  OverviewTile,
  SourceBadge,
  StatusRow,
} from "./deskShared";

type Props = {
  open: boolean;
  onToggle: () => void;
};

type LocationTarget = {
  icao?: string;
  iata?: string;
  kind?: string;
  name: string;
  city?: string;
};

function formatNullableNumber(value: number | null, suffix: string, digits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable";
  }
  return digits > 0 ? `${value.toFixed(digits)} ${suffix}` : `${Math.round(value)} ${suffix}`;
}

function formatCloudLayers(layers: Array<{ coverage: string | null; base_ft_agl: number | null }>): string {
  const entries = layers
    .map((layer) => {
      if (!layer.coverage && layer.base_ft_agl === null) {
        return null;
      }
      if (layer.coverage && layer.base_ft_agl !== null) {
        return `${layer.coverage} ${layer.base_ft_agl} ft`;
      }
      return layer.coverage ?? (layer.base_ft_agl !== null ? `${layer.base_ft_agl} ft` : null);
    })
    .filter((value): value is string => Boolean(value));

  return entries.length > 0 ? entries.join(" - ") : "Unavailable";
}

export function AviationDeskSection({ open, onToggle }: Props) {
  const selectedLocation = useStore((state) => state.selectedLocation) as LocationTarget | null;
  const selectedAirport = selectedLocation?.kind === "airport" ? selectedLocation : null;
  const [stationQuery, setStationQuery] = useState("");
  const [metar, setMetar] = useState<AviationMetarResponse | null>(null);
  const [taf, setTaf] = useState<AviationForecastResponse | null>(null);
  const [sigmet, setSigmet] = useState<AviationAlertResponse | null>(null);
  const [loadingStations, setLoadingStations] = useState(false);
  const [loadingSigmet, setLoadingSigmet] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);
  const [sigmetError, setSigmetError] = useState<string | null>(null);
  const [sigmetRequested, setSigmetRequested] = useState(false);
  const [autoLoadedStation, setAutoLoadedStation] = useState<string | null>(null);

  const stationHint = selectedAirport?.icao
    ? `${selectedAirport.name}${selectedAirport.city ? ` - ${selectedAirport.city}` : ""}`
    : "Enter one or more station IDs";

  useEffect(() => {
    if (selectedAirport?.icao && !stationQuery.trim()) {
      setStationQuery(selectedAirport.icao);
    }
  }, [selectedAirport?.icao, stationQuery]);

  const loadSigmets = async () => {
    setLoadingSigmet(true);
    setSigmetError(null);
    try {
      const response = await api.getAviationSigmet();
      setSigmet(response);
    } catch (error) {
      setSigmetError(getErrorMessage(error, "SIGMET request failed."));
    } finally {
      setLoadingSigmet(false);
    }
  };

  const loadStationProducts = async (queryOverride?: string) => {
    const ids = (queryOverride ?? stationQuery).trim().toUpperCase();
    if (!ids) {
      setStationError("Enter at least one station identifier.");
      return;
    }

    setLoadingStations(true);
    setStationError(null);
    try {
      const [metarResponse, tafResponse] = await Promise.all([
        api.getAviationMetar(ids),
        api.getAviationTaf(ids),
      ]);
      setMetar(metarResponse);
      setTaf(tafResponse);
    } catch (error) {
      setStationError(getErrorMessage(error, "Aviation station lookup failed."));
    } finally {
      setLoadingStations(false);
    }
  };

  useEffect(() => {
    if (open && !sigmetRequested) {
      setSigmetRequested(true);
      void loadSigmets();
    }
  }, [open, sigmetRequested]);

  useEffect(() => {
    const stationId = selectedAirport?.icao?.trim().toUpperCase() ?? null;
    if (!open || !stationId || autoLoadedStation === stationId) {
      return;
    }
    setStationQuery(stationId);
    setAutoLoadedStation(stationId);
    void loadStationProducts(stationId);
  }, [autoLoadedStation, open, selectedAirport?.icao]);

  const metars = metar?.metars ?? [];
  const tafs = taf?.tafs ?? [];
  const sigmets = sigmet?.sigmets ?? [];
  const severeSigmets = useMemo(
    () => sigmets.filter((item) => (item.hazard_type ?? "").toLowerCase().includes("volcan") || (item.hazard_type ?? "").toLowerCase().includes("turb") || (item.hazard_type ?? "").toLowerCase().includes("storm")),
    [sigmets],
  );

  return (
    <div className={`sp-section ${open ? "sp-section--open" : ""}`}>
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">AV</span>
        <span className="sp-header-label">Aviation Weather</span>
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body">
          <div className="sp-overview-grid">
            <OverviewTile label="Provider" value="AWC" />
            <OverviewTile label="METAR" value={String(metars.length)} />
            <OverviewTile label="TAF" value={String(tafs.length)} />
            <OverviewTile label="SIGMET" value={String(sigmets.length)} />
            <OverviewTile label="Severe" value={String(severeSigmets.length)} />
            <OverviewTile label="Station" value={stationQuery.trim() || "None"} />
          </div>

          <div className="sp-form-grid">
            <div className="sp-text-block">
              <div className="sp-subtitle">Station Lookup</div>
              <p>{stationHint}. Use ICAO IDs for the cleanest AWC match.</p>
            </div>

            <input
              className="sp-input"
              value={stationQuery}
              onChange={(event) => setStationQuery(event.target.value.toUpperCase())}
              placeholder="e.g. VABB,VIDP"
            />

            <div className="sp-action-row">
              <button type="button" className="sp-btn" onClick={() => void loadStationProducts()} disabled={loadingStations}>
                {loadingStations ? "LOADING" : "LOAD METAR/TAF"}
              </button>
              <button type="button" className="sp-btn sp-btn--ghost" onClick={() => void loadSigmets()} disabled={loadingSigmet}>
                {loadingSigmet ? "SYNCING" : "REFRESH SIGMET"}
              </button>
            </div>
          </div>

          {stationError ? <InlineNotice tone="danger" message={stationError} /> : null}
          {sigmetError ? <InlineNotice tone="danger" message={sigmetError} /> : null}

          <div className="sp-list-block">
            <div className="sp-subtitle">METAR</div>
            {metars.length === 0 ? (
              <div className="sp-more">Unavailable.</div>
            ) : (
              metars.slice(0, 4).map((item) => <MetarCard key={item.station_id} item={item} />)
            )}
          </div>

          <div className="sp-list-block">
            <div className="sp-subtitle">TAF</div>
            {tafs.length === 0 ? (
              <div className="sp-more">Unavailable.</div>
            ) : (
              tafs.slice(0, 3).map((item) => <TafCard key={item.station_id} item={item} />)
            )}
          </div>

          <div className="sp-list-block">
            <div className="sp-subtitle">SIGMET</div>
            {sigmets.length === 0 ? (
              <div className="sp-more">Unavailable.</div>
            ) : (
              sigmets.slice(0, 8).map((item, index) => <SigmetRow key={`${item.alert_id ?? item.designator ?? "sigmet"}-${index}`} item={item} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetarCard({ item }: { item: AviationMetarResponse["metars"][number] }) {
  return (
    <div className="sp-admin-card">
      <div className="sp-admin-card__head">
        <div>
          <div className="sp-ac-cs">{item.station_id}</div>
          <div className="sp-ac-hex">{formatShortDateTime(item.observation_time)}</div>
        </div>
        <SourceBadge source={item.source} />
      </div>
      <div className="sp-data-grid">
        <StatusRow label="Flight Cat" value={item.flight_category ?? "Unavailable"} />
        <StatusRow label="Visibility" value={formatNullableNumber(item.visibility_sm, "sm", 1)} />
        <StatusRow label="Wind" value={formatNullableNumber(item.wind_speed_kt, "kt")} meta={item.wind_direction_deg !== null ? `${Math.round(item.wind_direction_deg)} deg` : "Direction unavailable"} />
        <StatusRow label="Temp / Dew" value={`${item.temperature_c !== null ? `${Math.round(item.temperature_c)} C` : "Unavailable"} / ${item.dewpoint_c !== null ? `${Math.round(item.dewpoint_c)} C` : "Unavailable"}`} />
        <StatusRow label="Altimeter" value={item.altimeter_in_hg !== null ? `${item.altimeter_in_hg.toFixed(2)} inHg` : "Unavailable"} />
        <StatusRow label="Ceiling" value={item.ceiling_ft_agl !== null ? `${Math.round(item.ceiling_ft_agl)} ft` : "Unavailable"} />
      </div>
      <StatusRow label="Cloud Layers" value={formatCloudLayers(item.cloud_layers)} />
      {item.raw_text ? <div className="drawer-note">{item.raw_text}</div> : null}
    </div>
  );
}

function TafCard({ item }: { item: AviationForecastResponse["tafs"][number] }) {
  return (
    <div className="sp-admin-card">
      <div className="sp-admin-card__head">
        <div>
          <div className="sp-ac-cs">{item.station_id}</div>
          <div className="sp-ac-hex">
            {formatShortDateTime(item.issue_time)} - {formatShortDateTime(item.valid_from)} {"->"} {formatShortDateTime(item.valid_to)}
          </div>
        </div>
        <SourceBadge source={item.source} />
      </div>
      {item.forecast_periods.length === 0 ? (
        <div className="sp-more">Unavailable.</div>
      ) : (
        item.forecast_periods.slice(0, 3).map((period, index) => (
          <StatusRow
            key={`${item.station_id}-${period.start_time ?? "period"}-${index}`}
            label={formatShortDateTime(period.start_time)}
            value={period.weather ?? "Unavailable"}
            meta={[
              period.change_indicator,
              period.wind_speed_kt !== null ? `${Math.round(period.wind_speed_kt)} kt` : null,
              period.visibility_sm !== null ? `${period.visibility_sm.toFixed(1)} sm` : null,
            ]
              .filter((value): value is string => Boolean(value))
              .join(" - ")}
            accessory={<SourceBadge source={period.source} />}
          />
        ))
      )}
      {item.raw_text ? <div className="drawer-note">{item.raw_text}</div> : null}
    </div>
  );
}

function SigmetRow({ item }: { item: AviationAlertData }) {
  return (
    <StatusRow
      label={item.hazard_type ?? item.designator ?? item.alert_id ?? "SIGMET"}
      value={item.affected_region ?? "Unavailable"}
      meta={[
        formatShortDateTime(item.issued_at),
        item.valid_to ? `Valid to ${formatShortDateTime(item.valid_to)}` : null,
        item.geometry ? "Geometry available" : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" - ")}
      tone={(item.hazard_type ?? "").toLowerCase().includes("volcan") ? "danger" : "warning"}
      accessory={<SourceBadge source={item.source} />}
    />
  );
}
