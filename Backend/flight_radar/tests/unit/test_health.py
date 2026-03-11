from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import Response

from app.api.v1 import health


def _closed_circuit() -> SimpleNamespace:
    return SimpleNamespace(state=SimpleNamespace(value="closed"))


def _patch_health_dependencies(monkeypatch, *, fake_client, fake_redis) -> None:
    monkeypatch.setattr(health, "get_pool", lambda: object())
    monkeypatch.setattr(health.aioredis, "Redis", lambda **kwargs: fake_client)
    monkeypatch.setattr(health, "RedisClient", lambda client: fake_redis)
    monkeypatch.setattr(health, "get_opensky_circuit", _closed_circuit)
    monkeypatch.setattr(health, "get_adsbexchange_circuit", _closed_circuit)
    monkeypatch.setattr(health, "get_adsblol_circuit", _closed_circuit)
    monkeypatch.setattr(health, "get_icao_aircraft_circuit", _closed_circuit)
    monkeypatch.setattr(health, "get_openmeteo_circuit", _closed_circuit)
    monkeypatch.setattr(health, "get_awc_metar_circuit", _closed_circuit)
    monkeypatch.setattr(health, "get_awc_taf_circuit", _closed_circuit)
    monkeypatch.setattr(health, "get_awc_sigmet_circuit", _closed_circuit)
    monkeypatch.setattr(health.settings, "AIRCRAFT_SOURCES", "spire")
    monkeypatch.setattr(health.settings, "COPERNICUS_CAMS_ENABLED", False)
    monkeypatch.setattr(health.settings, "COPERNICUS_CEMS_ENABLED", False)
    monkeypatch.setattr(health.settings, "SPIRE_POLL_INTERVAL", 15)


@pytest.mark.asyncio
async def test_readiness_reports_stale_aircraft_worker_as_degraded(monkeypatch):
    fake_client = MagicMock()
    fake_client.srandmember = AsyncMock(return_value="ABC123")
    fake_client.aclose = AsyncMock()
    fake_redis = MagicMock()
    fake_redis.ping = AsyncMock(return_value=True)
    fake_redis.hgetall = AsyncMock(return_value={"observed_at": "100.0"})

    _patch_health_dependencies(monkeypatch, fake_client=fake_client, fake_redis=fake_redis)
    monkeypatch.setattr(health.time, "time", lambda: 200.0)

    response = Response()
    result = await health.readiness(response)

    assert response.status_code == 200
    assert result.status == "degraded"
    assert result.aircraft_worker is not None
    assert result.aircraft_worker.status == "degraded"
    assert result.aircraft_worker.age_seconds == 100.0


@pytest.mark.asyncio
async def test_readiness_reports_aircraft_worker_no_data_without_failing_probe(monkeypatch):
    fake_client = MagicMock()
    fake_client.srandmember = AsyncMock(return_value=None)
    fake_client.aclose = AsyncMock()
    fake_redis = MagicMock()
    fake_redis.ping = AsyncMock(return_value=True)
    fake_redis.hgetall = AsyncMock()

    _patch_health_dependencies(monkeypatch, fake_client=fake_client, fake_redis=fake_redis)

    response = Response()
    result = await health.readiness(response)

    assert response.status_code == 200
    assert result.status == "degraded"
    assert result.aircraft_worker is not None
    assert result.aircraft_worker.status == "no_data"
    fake_redis.hgetall.assert_not_awaited()
