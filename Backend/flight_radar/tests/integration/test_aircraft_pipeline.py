"""
Integration test: aircraft ingestion -> Redis -> aircraft service response.
Uses a mock Redis to avoid needing a live Redis instance in CI.
"""
from unittest.mock import AsyncMock

import pytest

from app.schemas.aircraft import AircraftState
from app.services.aircraft_service import list_aircraft


@pytest.fixture
def sample_aircraft() -> list[AircraftState]:
    return [
        AircraftState(
            icao="AAA111",
            callsign="FL111",
            latitude=20.0000,
            longitude=77.0000,
            altitude=35000.0,
            velocity=850.0,
            heading=90.0,
        ),
        AircraftState(
            icao="BBB222",
            callsign="FL222",
            latitude=20.0001,
            longitude=77.0001,
            altitude=35050.0,
            velocity=840.0,
            heading=270.0,
        ),
        AircraftState(
            icao="CCC333",
            callsign="FL333",
            latitude=30.0,
            longitude=85.0,
            altitude=40000.0,
            velocity=900.0,
            heading=45.0,
        ),
    ]


@pytest.mark.asyncio
async def test_write_and_read_aircraft(mock_redis, sample_aircraft):
    """Mocked Redis aircraft records can be read back via list_aircraft."""
    mock_redis.smembers = AsyncMock(return_value={ac.icao for ac in sample_aircraft})

    aircraft_map = {
        ac.icao: {
            "icao": ac.icao,
            "callsign": ac.callsign or "",
            "latitude": str(ac.latitude),
            "longitude": str(ac.longitude),
            "altitude": str(ac.altitude),
            "velocity": str(ac.velocity),
            "heading": str(ac.heading),
            "on_ground": "false",
        }
        for ac in sample_aircraft
    }
    mock_redis.hgetall = AsyncMock(side_effect=lambda key: aircraft_map.get(key.split(":")[1], {}))

    result = await list_aircraft(mock_redis)

    assert result.count == len(sample_aircraft)
