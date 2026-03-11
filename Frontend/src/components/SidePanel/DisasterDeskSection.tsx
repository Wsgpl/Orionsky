import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useStore } from "../../store";
import type { DisasterContextData, DisasterContextResponse } from "../../types";
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

type ClosedFilter = "all" | "open" | "closed";

function listLabel(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "Unavailable";
}

export function DisasterDeskSection({ open, onToggle }: Props) {
  const disasterContext = useStore((state) => state.disasterContext);
  const setDisasterContext = useStore((state) => state.setDisasterContext);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drmPhase, setDrmPhase] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [closedFilter, setClosedFilter] = useState<ClosedFilter>("all");

  const loadDisasters = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getDisasters();
      setDisasterContext(response);
    } catch (disasterError) {
      setError(getErrorMessage(disasterError, "Disaster context request failed."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !requested) {
      setRequested(true);
      void loadDisasters();
    }
  }, [open, requested]);

  const events = disasterContext?.events ?? [];
  const drmPhaseOptions = useMemo(
    () =>
      [...new Set(events.map((event) => event.drm_phase).filter((value): value is string => Boolean(value)))]
        .sort((left, right) => left.localeCompare(right)),
    [events],
  );
  const eventTypeOptions = useMemo(
    () =>
      [...new Set(events.map((event) => event.event_type).filter((value): value is string => Boolean(value)))]
        .sort((left, right) => left.localeCompare(right)),
    [events],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (drmPhase !== "all" && event.drm_phase !== drmPhase) {
          return false;
        }
        if (eventType !== "all" && event.event_type !== eventType) {
          return false;
        }
        if (closedFilter === "open" && event.closed !== false) {
          return false;
        }
        if (closedFilter === "closed" && event.closed !== true) {
          return false;
        }
        return true;
      }),
    [closedFilter, drmPhase, eventType, events],
  );

  const openCount = events.filter((event) => event.closed === false).length;
  const geometryCount = events.filter((event) => event.geometry !== null).length;

  return (
    <div className={`sp-section ${open ? "sp-section--open" : ""}`}>
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">DS</span>
        <span className="sp-header-label">Disaster Context</span>
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body">
          <div className="sp-overview-grid">
            <OverviewTile label="Provider" value={formatProviderLabel(disasterContext?.source ?? "copernicus_cems")} />
            <OverviewTile label="Events" value={String(disasterContext?.count ?? 0)} />
            <OverviewTile label="Open" value={String(openCount)} />
            <OverviewTile label="Geometry" value={String(geometryCount)} />
            <OverviewTile label="Phase" value={drmPhase === "all" ? "All" : drmPhase} />
            <OverviewTile label="Type" value={eventType === "all" ? "All" : eventType} />
          </div>

          <div className="sp-form-grid">
            <div className="sp-filter-grid">
              <select className="sp-select" value={drmPhase} onChange={(event) => setDrmPhase(event.target.value)}>
                <option value="all">All DRM phases</option>
                {drmPhaseOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select className="sp-select" value={eventType} onChange={(event) => setEventType(event.target.value)}>
                <option value="all">All event types</option>
                {eventTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="sp-action-row">
              <button
                type="button"
                className={`sp-btn ${closedFilter === "all" ? "" : "sp-btn--ghost"}`}
                onClick={() => setClosedFilter("all")}
              >
                ALL
              </button>
              <button
                type="button"
                className={`sp-btn ${closedFilter === "open" ? "" : "sp-btn--ghost"}`}
                onClick={() => setClosedFilter("open")}
              >
                OPEN
              </button>
              <button
                type="button"
                className={`sp-btn ${closedFilter === "closed" ? "" : "sp-btn--ghost"}`}
                onClick={() => setClosedFilter("closed")}
              >
                CLOSED
              </button>
              <button type="button" className="sp-btn sp-btn--ghost" onClick={() => void loadDisasters()} disabled={loading}>
                {loading ? "LOADING" : "REFRESH"}
              </button>
            </div>
          </div>

          {error ? <InlineNotice tone="danger" message={error} /> : null}
          {!loading && disasterContext && disasterContext.count === 0 ? (
            <InlineNotice tone="info" message="No Copernicus CEMS events are currently available." />
          ) : null}

          <div className="sp-list-block">
            <div className="sp-subtitle">Filtered Events</div>
            {filteredEvents.length === 0 ? (
              <div className="sp-more">Unavailable.</div>
            ) : (
              filteredEvents.slice(0, 10).map((event) => <DisasterEventCard key={event.event_id} event={event} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DisasterEventCard({ event }: { event: DisasterContextData }) {
  return (
    <div className="sp-admin-card">
      <div className="sp-admin-card__head">
        <div>
          <div className="sp-ac-cs">{event.title ?? event.event_id}</div>
          <div className="sp-ac-hex">{event.event_id}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
          <SourceBadge source={event.source} />
          <span className={`sp-inline-badge ${event.closed ? "sp-inline-badge--muted" : ""}`}>
            {event.closed ? "Closed" : "Open"}
          </span>
        </div>
      </div>
      <StatusRow
        label="Event Type"
        value={event.event_type ?? "Unavailable"}
        meta={[event.event_subtype, event.drm_phase].filter((value): value is string => Boolean(value)).join(" - ")}
      />
      <StatusRow
        label="Region"
        value={listLabel(event.country_names)}
        meta={event.continent ?? undefined}
      />
      <StatusRow
        label="Areas"
        value={listLabel(event.area_names)}
        meta={event.geometry ? "Geometry preserved as WKT metadata" : "Geometry unavailable"}
      />
      <StatusRow
        label="Timeline"
        value={formatShortDateTime(event.updated_at ?? event.issued_at ?? event.event_time)}
        meta={event.valid_to ? `Valid to ${formatShortDateTime(event.valid_to)}` : undefined}
      />
      <StatusRow
        label="Description"
        value={event.description ?? "Unavailable"}
      />
    </div>
  );
}
