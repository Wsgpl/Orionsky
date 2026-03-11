"""Unit tests for the derived aviation risk engine."""
from app.engines.aviation_risk_engine import AviationRiskEngineInput, build_aviation_risk_assessment
from app.schemas.air_quality import AirQualityData
from app.schemas.aviation_risk import AviationRiskAirportContext
from app.schemas.aviation import AviationAlertData, AviationAirportWeatherData
from app.schemas.disaster import DisasterContextData
from app.schemas.forecast import ForecastCurrent
from app.schemas.weather import GeneralWeatherData


def _make_weather(**overrides) -> GeneralWeatherData:
    payload = {
        "latitude": 28.6,
        "longitude": 77.2,
        "temperature": 30.0,
        "precip_mm": 0.0,
        "humidity": 55.0,
        "pressure": 1008.0,
        "wind_speed": 4.0,
        "wind_direction": 180.0,
        "cloud_cover": 20.0,
        "visibility": 10000.0,
        "condition": "clear",
        "source": "openmeteo",
    }
    payload.update(overrides)
    return GeneralWeatherData(**payload)


def _make_forecast_current(**overrides) -> ForecastCurrent:
    payload = {
        "source": "openmeteo",
        "temperature": 30.0,
        "apparent_temperature": 32.0,
        "humidity": 55.0,
        "pressure": 1008.0,
        "wind_speed": 4.0,
        "wind_direction": 180.0,
        "precipitation_amount": 0.0,
        "cloud_cover": 20.0,
        "visibility": 10000.0,
        "condition": "clear",
        "observed_at": "2026-04-02T10:00:00+00:00",
    }
    payload.update(overrides)
    return ForecastCurrent(**payload)


def _make_metar(**overrides) -> AviationAirportWeatherData:
    payload = {
        "station_id": "VIDP",
        "latitude": 28.56,
        "longitude": 77.10,
        "observation_time": "2026-04-02T10:00:00+00:00",
        "raw_text": "VIDP 021000Z 22024G30KT 1SM TSRA BKN008",
        "visibility_sm": 1.0,
        "wind_speed_kt": 24.0,
        "wind_gust_kt": 30.0,
        "wind_direction_deg": 220.0,
        "temperature_c": 29.0,
        "dewpoint_c": 24.0,
        "altimeter_in_hg": 29.91,
        "pressure_hpa": 1013.0,
        "ceiling_ft_agl": 800,
        "cloud_layers": [],
        "flight_category": "IFR",
        "source": "awc",
    }
    payload.update(overrides)
    return AviationAirportWeatherData(**payload)


def test_metar_and_sigmet_drive_high_operational_risk():
    response = build_aviation_risk_assessment(
        AviationRiskEngineInput(
            latitude=28.6,
            longitude=77.2,
            evaluated_at="2026-04-02T10:00:00+00:00",
            weather=_make_weather(),
            forecast_current=_make_forecast_current(),
            metar=_make_metar(),
            location_sigmets=[
                AviationAlertData(
                    alert_id="SIG1",
                    hazard_type="Thunderstorm",
                    description="Embedded TS",
                    source="awc",
                )
            ],
            disaster_data_available=False,
        )
    )

    factor_map = {item.category: item for item in response.factors}
    assert response.overall_level == "high"
    assert factor_map["wind"].level == "high"
    assert factor_map["visibility"].level == "high"
    assert factor_map["storm"].level == "high"
    assert factor_map["ceiling"].level == "high"


def test_disaster_failure_stays_unavailable_not_low():
    response = build_aviation_risk_assessment(
        AviationRiskEngineInput(
            latitude=28.6,
            longitude=77.2,
            evaluated_at="2026-04-02T10:00:00+00:00",
            weather=_make_weather(),
            forecast_current=_make_forecast_current(),
            disaster_data_available=False,
            disaster_event_count=0,
        )
    )

    factor_map = {item.category: item for item in response.factors}
    assert factor_map["disaster"].level is None
    assert "unavailable" in factor_map["disaster"].explanation.lower()


def test_air_quality_risk_uses_real_pm25_thresholds():
    response = build_aviation_risk_assessment(
        AviationRiskEngineInput(
            latitude=28.6,
            longitude=77.2,
            evaluated_at="2026-04-02T10:00:00+00:00",
            weather=_make_weather(),
            forecast_current=_make_forecast_current(),
            air_quality=AirQualityData(
                latitude=28.0,
                longitude=77.0,
                timestamp="2026-04-02T10:00:00+00:00",
                pm25=42.0,
                pm10=55.0,
                ozone=None,
                no2=None,
                so2=None,
                co=None,
                aqi_category=None,
                source="copernicus_cams",
            ),
            disaster_data_available=False,
        )
    )

    factor_map = {item.category: item for item in response.factors}
    assert factor_map["air_quality"].level == "high"
    assert factor_map["air_quality"].value == 42.0


def test_active_matched_disaster_event_is_high():
    response = build_aviation_risk_assessment(
        AviationRiskEngineInput(
            latitude=28.6,
            longitude=77.2,
            evaluated_at="2026-04-02T10:00:00+00:00",
            weather=_make_weather(),
            forecast_current=_make_forecast_current(),
            disaster_data_available=True,
            disaster_event_count=2,
            disaster_evaluable_count=2,
            location_disasters=[
                DisasterContextData(
                    event_id="CEMS-1",
                    event_type="Flood",
                    title="Major flood event",
                    description="Active flood footprint",
                    closed=False,
                    source="copernicus_cems",
                )
            ],
        )
    )

    factor_map = {item.category: item for item in response.factors}
    assert factor_map["disaster"].level == "high"
    assert factor_map["disaster"].source == "copernicus_cems"


def test_far_airport_observation_does_not_override_route_point_weather():
    response = build_aviation_risk_assessment(
        AviationRiskEngineInput(
            latitude=28.6,
            longitude=77.2,
            evaluated_at="2026-04-02T10:00:00+00:00",
            nearest_airport=AviationRiskAirportContext(
                icao="VIDP",
                iata="DEL",
                name="Indira Gandhi International",
                city="Delhi",
                country="India",
                latitude=28.56,
                longitude=77.10,
                distance_km=55.0,
            ),
            weather=_make_weather(wind_speed=3.0, visibility=12000.0, condition="Clear sky"),
            forecast_current=_make_forecast_current(
                wind_speed=4.0,
                visibility=12000.0,
                condition="Clear sky",
            ),
            metar=_make_metar(
                raw_text="VIDP 021000Z 22024G30KT 1SM TSRA BKN008",
                visibility_sm=1.0,
                wind_speed_kt=24.0,
                wind_gust_kt=30.0,
            ),
        )
    )

    factor_map = {item.category: item for item in response.factors}
    assert factor_map["wind"].level == "low"
    assert factor_map["visibility"].level == "low"
