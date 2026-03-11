import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "../../services/api";
import { useStore } from "../../store";
import type {
  DailyForecastItem,
  ForecastCurrent,
  ForecastResponse,
  HourlyForecastItem,
  WeatherCell,
} from "../../types";
import { compassPoint, formatCoord } from "../../utils/mapHelpers";
import {
  getWeatherConditionGlyph,
  formatWeatherValue,
} from "../../utils/weatherMap";
import { FOUNDATION_COLORS, WEATHER_METRIC_ACCENTS, getAppPalette } from "../../utils/designSystem";

export type WeatherSidebarSelection = {
  latitude: number;
  longitude: number;
  label?: string;
  subtitle?: string;
};

type WeatherSidebarProps = {
  isOpen: boolean;
  selection: WeatherSidebarSelection | null;
  weatherCell: WeatherCell | null;
  onClose: () => void;
};

const SIDEBAR_WIDTH = "min(480px, calc(100vw - 24px))";
const PANEL_CARD_STYLE = {
  background: "rgba(255, 255, 255, 0.6)",
  border: "1px solid rgba(255, 255, 255, 0.24)",
  boxShadow: "0 14px 30px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.32)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};
const SECTION_CARD_STYLE = {
  ...PANEL_CARD_STYLE,
  padding: "18px 18px 20px",
  borderRadius: 12,
  display: "grid",
  gap: 16,
};
const SECTION_TITLE_STYLE = {
  fontFamily: "Orbitron, monospace",
  fontSize: 11,
  letterSpacing: 1.15,
  textTransform: "uppercase" as const,
  color: FOUNDATION_COLORS.textBody,
};
const METRIC_LABEL_STYLE = {
  fontFamily: "Orbitron, monospace",
  fontSize: 10,
  letterSpacing: 0.9,
  color: FOUNDATION_COLORS.textMuted,
  textTransform: "uppercase" as const,
};
const CARD_TRANSITION = "transform 200ms ease, box-shadow 200ms ease, background 200ms ease, border-color 200ms ease, opacity 200ms ease";
const PANEL_TRANSITION = "transform 200ms ease, opacity 200ms ease";

type WeatherMetricIconKind =
  | "wind"
  | "humidity"
  | "pressure"
  | "precipitation"
  | "visibility"
  | "feelsLike"
  | "cloud";

function getMetricAccent(kind?: WeatherMetricIconKind): string {
  return kind ? WEATHER_METRIC_ACCENTS[kind] : FOUNDATION_COLORS.info;
}

function WeatherMetricIcon({ kind }: { kind: WeatherMetricIconKind }) {
  switch (kind) {
    case "wind":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h10.5c1.9 0 3.5-1.4 3.5-3.2S15.4 1.6 13.5 1.6c-1.4 0-2.6.8-3.1 2" />
          <path d="M3 12h14.8c1.6 0 2.9 1.2 2.9 2.7s-1.3 2.8-2.9 2.8H10.8" />
          <path d="M3 16.5h7.3c1.5 0 2.7 1.1 2.7 2.5s-1.2 2.5-2.7 2.5" />
        </svg>
      );
    case "humidity":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.2C8.8 7 6.2 10.2 6.2 13.6a5.8 5.8 0 1 0 11.6 0c0-3.4-2.6-6.6-5.8-10.4z" />
          <path d="M9.3 14.7a3 3 0 0 0 5.1 1.9" />
        </svg>
      );
    case "pressure":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 12l4.3-2.9" />
          <path d="M12 6.2v1.2M7.9 8l.9.8M6.2 12h1.2M17.8 12H19M16.1 8l-.9.8" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "precipitation":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17.5a5.5 5.5 0 1 1 1.2-10.8A7 7 0 0 1 20 9.3a4.5 4.5 0 0 1-1.4 8.2H7z" />
          <path d="M8.3 19.1v2.4" />
          <path d="M12 19.1v2.4" />
          <path d="M15.7 19.1v2.4" />
        </svg>
      );
    case "visibility":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.6 12s3.4-5.6 9.4-5.6 9.4 5.6 9.4 5.6-3.4 5.6-9.4 5.6S2.6 12 2.6 12z" />
          <circle cx="12" cy="12" r="2.7" />
        </svg>
      );
    case "feelsLike":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.5 6.5a1.5 1.5 0 0 1 3 0v8.1a4.5 4.5 0 1 1-3 0z" />
          <path d="M12 6.5v8.5" />
          <circle cx="12" cy="18.2" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "cloud":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17.5a5.5 5.5 0 1 1 1.2-10.8A7 7 0 0 1 20 9.3a4.5 4.5 0 0 1-1.4 8.2H7z" />
        </svg>
      );
    default:
      return null;
  }
}

function MotionCard({
  children,
  style,
  hoverScale = 1.05,
}: {
  children: ReactNode;
  style: CSSProperties;
  hoverScale?: number;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        transition: CARD_TRANSITION,
        transform: hovered ? `translateY(-2px) scale(${hoverScale})` : "translateY(0) scale(1)",
        willChange: "transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function WeatherSidebarSkeletonStyles() {
  return (
    <style>
      {`
        @keyframes weatherSidebarSkeletonPulse {
          0% { opacity: 0.54; }
          50% { opacity: 1; }
          100% { opacity: 0.54; }
        }
      `}
    </style>
  );
}

function SkeletonBlock({
  width = "100%",
  height,
  radius = 12,
  style,
}: {
  width?: number | string;
  height: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: "linear-gradient(180deg, rgba(226, 232, 240, 0.78), rgba(255, 255, 255, 0.96))",
        animation: "weatherSidebarSkeletonPulse 1.35s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function MetricSkeletonCard() {
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: 20,
        ...PANEL_CARD_STYLE,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <SkeletonBlock width={38} height={38} radius={14} />
        <SkeletonBlock width="42%" height={10} radius={999} />
      </div>
      <SkeletonBlock width="62%" height={22} radius={10} />
      <SkeletonBlock width="74%" height={10} radius={999} />
    </div>
  );
}

function MetricSkeletonGrid({ count }: { count: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      {Array.from({ length: count }, (_, index) => (
        <MetricSkeletonCard key={index} />
      ))}
    </div>
  );
}

function CurrentWeatherSummarySkeleton() {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}>
        <div style={{ display: "grid", gap: 12, flex: 1 }}>
          <SkeletonBlock width="34%" height={10} radius={999} />
          <SkeletonBlock width="46%" height={48} radius={16} />
          <SkeletonBlock width="58%" height={18} radius={10} />
          <SkeletonBlock width="76%" height={12} radius={999} />
        </div>
        <SkeletonBlock width={82} height={82} radius={22} />
      </div>
      <MetricSkeletonGrid count={4} />
    </div>
  );
}

function HourlyForecastSkeleton() {
  return (
    <div style={{ padding: "2px 0 0" }}>
      <div
        style={{
          padding: "16px 0 6px",
          display: "grid",
          gap: 14,
        }}
      >
        <SkeletonBlock width="100%" height={118} radius={18} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock key={index} width="100%" height={12} radius={999} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DailyForecastSkeleton() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          style={{
            display: "grid",
            gridTemplateColumns: "78px 54px minmax(0, 1fr)",
            alignItems: "center",
            gap: 14,
            padding: "15px 16px",
            borderRadius: 20,
            ...PANEL_CARD_STYLE,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <SkeletonBlock width="78%" height={10} radius={999} />
            <SkeletonBlock width="56%" height={10} radius={999} />
          </div>
          <SkeletonBlock width={48} height={48} radius={16} />
          <div style={{ display: "grid", gap: 8 }}>
            <SkeletonBlock width="52%" height={12} radius={999} />
            <SkeletonBlock width="68%" height={14} radius={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatClock(value: Date): string {
  return value.toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatHourLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
  });
}

function formatPrecipitationSummary(
  amount: number | null | undefined,
  probability?: number | null,
): string {
  const parts: string[] = [];
  if (typeof amount === "number" && Number.isFinite(amount)) {
    parts.push(formatWeatherValue("precipitation", amount));
  }
  if (typeof probability === "number" && Number.isFinite(probability)) {
    parts.push(`${Math.round(probability)}% chance`);
  }
  return parts.join(" / ") || "Unavailable";
}

type SidebarCurrentWeather = Pick<
  ForecastCurrent,
  | "temperature"
  | "apparent_temperature"
  | "humidity"
  | "pressure"
  | "wind_speed"
  | "wind_direction"
  | "precipitation_amount"
  | "cloud_cover"
  | "visibility"
  | "condition"
>;

function hasForecastData(forecast: ForecastResponse | null): boolean {
  if (!forecast) {
    return false;
  }

  if (typeof forecast.source === "string" && forecast.source.toLowerCase() === "unavailable") {
    return false;
  }

  return Boolean(forecast.current) || forecast.hourly.length > 0 || forecast.daily.length > 0;
}

function getLiveCurrentWeather(
  forecast: ForecastResponse | null,
): SidebarCurrentWeather | null {
  return forecast?.current ?? null;
}

function getHourlyTemperatureRange(items: HourlyForecastItem[]): { min: number; max: number } | null {
  const values = items
    .map((item) => item.temperature)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (Math.abs(max - min) < 0.5) {
    return { min: min - 1, max: max + 1 };
  }

  return { min, max };
}

function parseWeatherDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRelevantHourlyForecast(
  hourly: HourlyForecastItem[],
  observedAt: string | null | undefined,
): HourlyForecastItem[] {
  const observedDate = parseWeatherDate(observedAt);
  if (!observedDate) {
    return hourly.slice(0, 12);
  }

  const currentHour = new Date(observedDate);
  currentHour.setMinutes(0, 0, 0);

  const futureItems = hourly.filter((item) => {
    const itemDate = parseWeatherDate(item.time);
    return itemDate ? itemDate.getTime() >= currentHour.getTime() : false;
  });

  return (futureItems.length > 0 ? futureItems : hourly).slice(0, 12);
}

function WeatherHourlyChart({
  hourly,
  observedAt,
}: {
  hourly: HourlyForecastItem[];
  observedAt: string | null | undefined;
}) {
  const usableHourly = getRelevantHourlyForecast(hourly, observedAt);
  const chartWidth = 560;
  const chartHeight = 116;
  const topPad = 18;
  const bottomPad = 34;
  const leftPad = 24;
  const usableWidth = Math.max(chartWidth - leftPad * 2, 120);
  const usableHeight = chartHeight - topPad - bottomPad;
  const temperatureRange = getHourlyTemperatureRange(usableHourly);

  if (!temperatureRange) {
    return <ForecastUnavailableState />;
  }

  const { min, max } = temperatureRange;

const validPoints = usableHourly
  .map((item, index) => {
    if (item.temperature === null || item.temperature === undefined) {
      return null;
    }

    const temperature = item.temperature;
    const normalized = (temperature - min) / (max - min || 1);

    return {
      index,
      item,
      temperature,
      normalized,
    };
  })
  .filter((point): point is NonNullable<typeof point> => point !== null);

const points = validPoints.map((point, visibleIndex) => {
  const x =
    leftPad +
    (visibleIndex / Math.max(validPoints.length - 1, 1)) * usableWidth;

  const y =
    topPad +
    usableHeight -
    point.normalized * usableHeight;

  return {
    x,
    y,
    item: point.item,
  };
});

  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div style={{ width: "100%", paddingBottom: 4, overflowX: "hidden" }}>
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Hourly weather trend"
      >
        <defs>
          <linearGradient id="weather-hourly-line" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor={FOUNDATION_COLORS.wind} />
            <stop offset="100%" stopColor={FOUNDATION_COLORS.info} />
          </linearGradient>
        </defs>
        <path
          d={`M ${leftPad} ${chartHeight - bottomPad} L ${chartWidth - leftPad} ${chartHeight - bottomPad}`}
          stroke={FOUNDATION_COLORS.borderSoft}
          strokeWidth="1"
        />
        <polyline
          points={path}
          fill="none"
          stroke="url(#weather-hourly-line)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point) => (
          <g key={point.item.time}>
            <circle cx={point.x} cy={point.y} r="4.5" fill="#ffffff" stroke={FOUNDATION_COLORS.info} strokeWidth="2" />
            <text
              x={point.x}
              y={point.y - 12}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={FOUNDATION_COLORS.textStrong}
            >
              {point.item.temperature !== null ? `${Math.round(point.item.temperature)}°C` : "Unavailable"}
            </text>
          </g>
        ))}
        {points.map((point) => {
          const glyph = getWeatherConditionGlyph(point.item.condition);
          return (
            <g key={`${point.item.time}-meta`}>
              <text
                x={point.x}
                y={chartHeight - 14}
                textAnchor="middle"
                fontSize="10"
                fill={FOUNDATION_COLORS.textMuted}
              >
                {formatHourLabel(point.item.time)}
              </text>
              {glyph ? (
                <text
                  x={point.x}
                  y={chartHeight - 30}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={FOUNDATION_COLORS.accent}
                >
                  {glyph.glyph}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function WeatherDailyList({ daily }: { daily: DailyForecastItem[] }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {daily.slice(0, 6).map((item) => {
        const glyph = getWeatherConditionGlyph(item.condition);
        return (
          <MotionCard
            key={item.date}
            hoverScale={1.05}
            style={{
              display: "grid",
              gridTemplateColumns: "78px 54px minmax(0, 1fr)",
              alignItems: "center",
              gap: 14,
              padding: "15px 16px",
              borderRadius: 20,
              ...PANEL_CARD_STYLE,
            }}
          >
            <div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: 11, letterSpacing: 0.95, color: FOUNDATION_COLORS.textBody }}>
                {formatDayLabel(item.date)}
              </div>
              <div style={{ fontSize: 11, color: FOUNDATION_COLORS.textMuted, marginTop: 5 }}>
                {new Date(item.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              </div>
              <div style={{ fontSize: 11, color: FOUNDATION_COLORS.textMuted, lineHeight: 1.4 }}>
                {formatPrecipitationSummary(item.precipitation_amount, item.precipitation_probability)}
              </div>
            </div>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                background: `linear-gradient(180deg, ${FOUNDATION_COLORS.accentSoft}, rgba(255, 255, 255, 0.86))`,
                color: FOUNDATION_COLORS.accent,
                fontFamily: "Orbitron, monospace",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {glyph?.glyph ?? "--"}
            </div>
            <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: FOUNDATION_COLORS.textBody, lineHeight: 1.35, fontWeight: 600 }}>{glyph?.label ?? "Unavailable"}</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: 15, fontWeight: 700, color: FOUNDATION_COLORS.textStrong }}>
                {item.temp_min !== null ? `${Math.round(item.temp_min)}°C` : "Unavailable"} / {item.temp_max !== null ? `${Math.round(item.temp_max)}°C` : "Unavailable"}
              </div>
            </div>
          </MotionCard>
        );
      })}
    </div>
  );
}

function DetailMetric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: WeatherMetricIconKind;
}) {
  const accent = getMetricAccent(icon);

  return (
    <MotionCard
      hoverScale={1.05}
      style={{
        padding: "16px",
        borderRadius: 20,
        ...PANEL_CARD_STYLE,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {icon ? (
          <span
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              color: accent,
              background: `linear-gradient(180deg, ${accent}16, rgba(255,255,255,0.7))`,
              boxShadow: `inset 0 0 0 1px ${accent}22`,
            }}
          >
            <WeatherMetricIcon kind={icon} />
          </span>
        ) : null}
        <div style={{ ...METRIC_LABEL_STYLE }}>{label}</div>
      </div>
      <div style={{ fontFamily: "Orbitron, monospace", fontSize: 22, fontWeight: 700, color: FOUNDATION_COLORS.textStrong, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: FOUNDATION_COLORS.textMuted, lineHeight: 1.45 }}>{sub}</div>}
    </MotionCard>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <section
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...SECTION_CARD_STYLE,
        transition: CARD_TRANSITION,
        transform: hovered ? "translateY(-2px) scale(1.02)" : "translateY(0) scale(1)",
        willChange: "transform",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={SECTION_TITLE_STYLE}>{title}</span>
        <span style={{ height: 1, background: `linear-gradient(90deg, ${FOUNDATION_COLORS.borderSoft}, rgba(148, 163, 184, 0.06))` }} />
      </div>
      {children}
    </section>
  );
}

function ForecastUnavailableState({
  message = "Unavailable.",
}: {
  message?: string;
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        borderRadius: 18,
        ...PANEL_CARD_STYLE,
        fontSize: 13,
        lineHeight: 1.55,
        color: FOUNDATION_COLORS.textMuted,
      }}
    >
      {message}
    </div>
  );
}

export function WeatherSidebar({
  isOpen,
  selection,
  weatherCell,
  onClose,
}: WeatherSidebarProps) {
  const theme = useStore((s) => s.theme);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    let active = true;

    if (!selection || !isOpen) {
      setForecast(null);
      setForecastError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    console.info("[WeatherSidebar] forecast request started", {
      latitude: Number(selection.latitude.toFixed(4)),
      longitude: Number(selection.longitude.toFixed(4)),
    });
    setForecast(null);
    setForecastError(null);
    setLoading(true);

    void api
      .getForecast({
        lat: Number(selection.latitude.toFixed(4)),
        lon: Number(selection.longitude.toFixed(4)),
      })
      .then((response) => {
        if (!active) {
          return;
        }

        if (!hasForecastData(response)) {
          console.warn("[WeatherSidebar] forecast response unavailable, hiding it", {
            source: response.source,
          });
          setForecast(null);
          setForecastError("Unavailable.");
          return;
        }

        console.info("[WeatherSidebar] forecast response received", {
          source: response.source,
          hourlyCount: response.hourly.length,
          dailyCount: response.daily.length,
          current: response.current
            ? {
                temperature: response.current.temperature,
                wind_speed: response.current.wind_speed,
                humidity: response.current.humidity,
                pressure: response.current.pressure,
                precipitation_amount: response.current.precipitation_amount,
                condition: response.current.condition,
                observed_at: response.current.observed_at,
              }
            : null,
          firstHourly: response.hourly[0] ?? null,
          firstDaily: response.daily[0] ?? null,
        });
        setForecast(response);
        setForecastError(null);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        console.warn("[WeatherSidebar] forecast request failed", error);
        setForecast(null);
        setForecastError("Unavailable.");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selection]);

  const current = getLiveCurrentWeather(forecast);
  const feelsLike = current?.apparent_temperature ?? null;
  const locationTitle = selection
    ? selection.label || `Lat ${selection.latitude.toFixed(2)}, Lon ${selection.longitude.toFixed(2)}`
    : "Weather details";
  const locationSubtitle = selection
    ? selection.subtitle || `${formatCoord(selection.latitude, "lat")} / ${formatCoord(selection.longitude, "lon")}`
    : "";
  const currentGlyph = getWeatherConditionGlyph(current?.condition);
  const palette = getAppPalette(theme);
  const showSkeletons = loading && Boolean(selection);
  const forecastStatusLabel = loading
    ? "Loading..."
    : forecast
      ? forecast.source
      : forecastError ?? "Unavailable.";

  useEffect(() => {
    if (!isOpen || !selection) {
      return;
    }

    console.info("[WeatherSidebar] final UI values", {
      latitude: Number(selection.latitude.toFixed(4)),
      longitude: Number(selection.longitude.toFixed(4)),
      currentSource: forecast?.current ? "forecast.current" : "unavailable",
      observedWeatherCellAvailable: Boolean(weatherCell),
      temperature: current?.temperature ?? null,
      apparentTemperature: current?.apparent_temperature ?? null,
      humidity: current?.humidity ?? null,
      pressure: current?.pressure ?? null,
      windSpeed: current?.wind_speed ?? null,
      windDirection: current?.wind_direction ?? null,
      precipitationAmount: current?.precipitation_amount ?? null,
      visibility: current?.visibility ?? null,
      condition: current?.condition ?? null,
      firstHourly: forecast?.hourly[0] ?? null,
      firstDaily: forecast?.daily[0] ?? null,
    });
  }, [current, forecast, isOpen, selection, weatherCell]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 960,
        pointerEvents: isOpen ? "auto" : "none",
        background: isOpen ? palette.overlayScrim : "rgba(15, 23, 42, 0)",
        transition: "background 200ms ease",
      }}
    >
      <WeatherSidebarSkeletonStyles />
      <aside
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          bottom: 18,
          width: SIDEBAR_WIDTH,
          borderRadius: 12,
          background: "rgba(255, 255, 255, 0.6)",
          boxShadow: "0 22px 48px rgba(15, 23, 42, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.26)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transform: isOpen ? "translateX(0) scale(1)" : "translateX(calc(100% + 24px)) scale(0.985)",
          transformOrigin: "right center",
          opacity: isOpen ? 1 : 0,
          transition: PANEL_TRANSITION,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 22px 16px",
            borderBottom: `1px solid ${palette.surfaceBorder}`,
          }}
        >
          <div>
            <div style={{ ...SECTION_TITLE_STYLE, color: palette.textMuted }}>
              Weather Insight
            </div>
            <div style={{ fontSize: 12, color: palette.textSoft, marginTop: 6 }}>
              {forecastStatusLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1px solid rgba(255, 255, 255, 0.24)",
              background: "rgba(255, 255, 255, 0.36)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              color: palette.textStrong,
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 700,
            }}
            aria-label="Close weather sidebar"
          >
            X
          </button>
        </div>

        <div
          style={{
            padding: "20px",
            overflowY: "auto",
            overflowX: "hidden",
            display: "grid",
            gap: 18,
          }}
        >
          <SidebarSection title="Location Header">
            <div
              style={{
                padding: "4px 2px 2px",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ ...METRIC_LABEL_STYLE }}>Selected Weather Point</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: 30, fontWeight: 800, color: FOUNDATION_COLORS.textStrong, lineHeight: 1.08 }}>{locationTitle}</div>
              <div style={{ fontSize: 14, color: FOUNDATION_COLORS.textMuted, lineHeight: 1.45 }}>{locationSubtitle}</div>
              <div style={{ fontSize: 13, color: FOUNDATION_COLORS.textBody, marginTop: 6, fontWeight: 600 }}>{formatClock(now)}</div>
            </div>
          </SidebarSection>

          <SidebarSection title="Current Weather Summary">
            {showSkeletons ? <CurrentWeatherSummarySkeleton /> : (
            <div
              style={{
                display: "grid",
                gap: 18,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}>
                <div>
                  <div style={{ ...METRIC_LABEL_STYLE, marginBottom: 10 }}>Current Conditions</div>
                  <div style={{ fontFamily: "Orbitron, monospace", fontSize: 52, lineHeight: 0.92, fontWeight: 800, color: FOUNDATION_COLORS.textStrong, letterSpacing: -1 }}>
                    {current ? `${Math.round(current.temperature)}°C` : "Unavailable"}
                  </div>
                  <div style={{ fontSize: 19, color: FOUNDATION_COLORS.textBody, marginTop: 12, fontWeight: 700, lineHeight: 1.25 }}>
                    {current?.condition ?? "Unavailable"}
                  </div>
                  <div style={{ fontSize: 12, color: FOUNDATION_COLORS.textMuted, marginTop: 9, lineHeight: 1.45 }}>
                    {current ? `${compassPoint(current.wind_direction)} wind / ${Math.round(current.cloud_cover)}% cloud cover` : "Unavailable"}
                  </div>
                </div>
                <div
                  style={{
                    minWidth: 82,
                    height: 82,
                    padding: "0 12px",
                    borderRadius: 22,
                    display: "grid",
                    placeItems: "center",
                    background: palette.surfaceBackground,
                    color: palette.accent,
                    fontFamily: "Orbitron, monospace",
                    fontSize: 15,
                    fontWeight: 700,
                    boxShadow: `inset 0 0 0 1px ${palette.surfaceBorder}`,
                  }}
                >
                  {currentGlyph?.glyph ?? "--"}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <DetailMetric icon="wind" label="Wind" value={current ? `${current.wind_speed.toFixed(1)} m/s` : "Unavailable"} />
                <DetailMetric icon="humidity" label="Humidity" value={current ? `${Math.round(current.humidity)}%` : "Unavailable"} />
                <DetailMetric icon="pressure" label="Pressure" value={current ? `${Math.round(current.pressure)} hPa` : "Unavailable"} />
                <DetailMetric icon="precipitation" label="Precipitation" value={formatPrecipitationSummary(current?.precipitation_amount)} />
                <DetailMetric icon="feelsLike" label="Feels Like" value={feelsLike !== null ? `${Math.round(feelsLike)}°C` : "Unavailable"} />
              </div>
            </div>
            )}
          </SidebarSection>

          <SidebarSection title="Hourly Forecast Graph">
            {showSkeletons ? <HourlyForecastSkeleton /> : (
            forecast && forecast.hourly.length > 0 ? (
              <div
                style={{
                  padding: "2px 0 0",
                }}
              >
                <WeatherHourlyChart hourly={forecast.hourly} observedAt={forecast.current?.observed_at} />
              </div>
            ) : (
              <ForecastUnavailableState message={forecastError ?? "Unavailable."} />
            )
            )}
          </SidebarSection>

          <SidebarSection title="Daily Forecast">
            {showSkeletons ? (
              <DailyForecastSkeleton />
            ) : forecast && forecast.daily.length > 0 ? (
              <WeatherDailyList daily={forecast.daily} />
            ) : (
              <ForecastUnavailableState message={forecastError ?? "Unavailable."} />
            )}
          </SidebarSection>

          <SidebarSection title="Weather Details Grid">
            {showSkeletons ? <MetricSkeletonGrid count={6} /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <DetailMetric
                icon="wind"
                label="Wind"
                value={current ? `${current.wind_speed.toFixed(1)} m/s` : "Unavailable"}
                sub={current ? `${Math.round(current.wind_direction)}° ${compassPoint(current.wind_direction)}` : undefined}
              />
              <DetailMetric icon="humidity" label="Humidity" value={current ? `${Math.round(current.humidity)}%` : "Unavailable"} />
              <DetailMetric icon="pressure" label="Pressure" value={current ? `${Math.round(current.pressure)} hPa` : "Unavailable"} />
              <DetailMetric
                icon="visibility"
                label="Visibility"
                value={current ? `${(current.visibility / 1000).toFixed(1)} km` : "Unavailable"}
              />
              <DetailMetric
                icon="feelsLike"
                label="Feels Like"
                value={feelsLike !== null ? `${Math.round(feelsLike)}°C` : "Unavailable"}
              />
              <DetailMetric
                icon="precipitation"
                label="Precipitation"
                value={formatPrecipitationSummary(current?.precipitation_amount)}
              />
            </div>
            )}
          </SidebarSection>

          <SidebarSection title="Coordinates">
            <div
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: FOUNDATION_COLORS.textMuted }}>Latitude</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: FOUNDATION_COLORS.textStrong }}>
                  {selection ? formatCoord(selection.latitude, "lat") : "Unavailable"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: FOUNDATION_COLORS.textMuted }}>Longitude</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: FOUNDATION_COLORS.textStrong }}>
                  {selection ? formatCoord(selection.longitude, "lon") : "Unavailable"}
                </span>
              </div>
            </div>
          </SidebarSection>
        </div>
      </aside>
    </div>
  );
}
