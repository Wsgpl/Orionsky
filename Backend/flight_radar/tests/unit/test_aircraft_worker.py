import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.aircraft import AircraftState
from app.workers import aircraft_worker


@pytest.mark.asyncio
async def test_fetch_from_sources_uses_rolling_aircraft_window(monkeypatch):
    rolling_aircraft: dict[str, tuple[AircraftState, float]] = {}
    first_aircraft = AircraftState(
        icao="AAA111",
        callsign="FL111",
        latitude=20.0,
        longitude=77.0,
        altitude=35000.0,
        velocity=850.0,
        heading=90.0,
    )
    fetch_mock = AsyncMock(side_effect=[[first_aircraft], [], []])

    monkeypatch.setattr(aircraft_worker, "_rolling_aircraft", rolling_aircraft)
    monkeypatch.setattr(aircraft_worker.settings, "AIRCRAFT_SOURCES", "spire")
    monkeypatch.setattr(aircraft_worker.spire, "fetch_aircraft", fetch_mock)
    monkeypatch.setattr(
        aircraft_worker,
        "time",
        SimpleNamespace(time=MagicMock(side_effect=[100.0, 150.0, 281.0])),
    )

    first_result, first_counts = await aircraft_worker._fetch_from_sources()
    second_result, second_counts = await aircraft_worker._fetch_from_sources()
    third_result, third_counts = await aircraft_worker._fetch_from_sources()

    assert [ac.icao for ac in first_result] == ["AAA111"]
    assert [ac.icao for ac in second_result] == ["AAA111"]
    assert third_result == []
    assert first_counts == {"spire": 1}
    assert second_counts == {"spire": 0}
    assert third_counts == {"spire": 0}


@pytest.mark.asyncio
async def test_aircraft_worker_always_fetches_fresh_data(monkeypatch):
    fake_pool = object()
    fake_client = MagicMock()
    fake_client.aclose = AsyncMock()
    fake_redis = MagicMock()
    fake_redis.get_json = AsyncMock()

    fetched_aircraft = [
        AircraftState(
            icao="AAA111",
            callsign="FL111",
            latitude=20.0,
            longitude=77.0,
            altitude=35000.0,
            velocity=850.0,
            heading=90.0,
        )
    ]
    fetch_mock = AsyncMock(return_value=(fetched_aircraft, {"spire": 1}))
    write_mock = AsyncMock(return_value=1)

    async def cancel_sleep(_: float) -> None:
        raise asyncio.CancelledError

    monkeypatch.setattr(aircraft_worker, "get_pool", lambda: fake_pool)
    monkeypatch.setattr(aircraft_worker.aioredis, "Redis", lambda **kwargs: fake_client)
    monkeypatch.setattr(aircraft_worker, "RedisClient", lambda client: fake_redis)
    monkeypatch.setattr(aircraft_worker, "_fetch_from_sources", fetch_mock)
    monkeypatch.setattr(aircraft_worker, "write_aircraft", write_mock)
    monkeypatch.setattr(aircraft_worker, "_within_settings_bounds", lambda ac, _: True)
    monkeypatch.setattr(aircraft_worker.asyncio, "sleep", cancel_sleep)

    with pytest.raises(asyncio.CancelledError):
        await aircraft_worker.aircraft_ingestion_loop()

    fetch_mock.assert_awaited_once()
    write_mock.assert_awaited_once_with(fake_redis, fetched_aircraft)
    fake_redis.get_json.assert_not_called()
    fake_client.aclose.assert_awaited_once()
