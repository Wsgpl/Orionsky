from unittest.mock import AsyncMock, MagicMock, call

import pytest

from app.schemas.aircraft import AircraftState
from app.services.aircraft_service import (
    AIRCRAFT_ALL_KEY,
    AIRCRAFT_ALL_NEXT_KEY,
    AIRCRAFT_DATA_CACHE_KEY,
    write_aircraft,
)


def _pipeline_mock() -> MagicMock:
    pipe = MagicMock()
    pipe.delete = MagicMock(return_value=pipe)
    pipe.hdel = MagicMock(return_value=pipe)
    pipe.hset = MagicMock(return_value=pipe)
    pipe.expire = MagicMock(return_value=pipe)
    pipe.sadd = MagicMock(return_value=pipe)
    pipe.rename = MagicMock(return_value=pipe)
    pipe.execute = AsyncMock(return_value=[])
    return pipe


@pytest.mark.asyncio
async def test_write_aircraft_stages_next_set_then_renames(mock_redis):
    pipe = _pipeline_mock()
    mock_redis.pipeline.return_value = pipe
    mock_redis.hgetall = AsyncMock(side_effect=[{"on_ground": "false"}, {}])

    aircraft_list = [
        AircraftState(
            icao="AAA111",
            callsign="FL111",
            latitude=20.0,
            longitude=77.0,
            altitude=35000.0,
            velocity=850.0,
            heading=90.0,
        ),
        AircraftState(
            icao="BBB222",
            callsign="FL222",
            latitude=21.0,
            longitude=78.0,
            altitude=36000.0,
            velocity=840.0,
            heading=180.0,
        ),
    ]

    count = await write_aircraft(mock_redis, aircraft_list)

    assert count == 2
    assert pipe.method_calls[0] == call.delete(AIRCRAFT_ALL_NEXT_KEY)
    assert pipe.sadd.mock_calls == [
        call(AIRCRAFT_ALL_NEXT_KEY, "AAA111"),
        call(AIRCRAFT_ALL_NEXT_KEY, "BBB222"),
    ]
    assert pipe.expire.mock_calls == [
        call("aircraft:prev:AAA111", 300),
        call("aircraft:AAA111", 300),
        call("aircraft:BBB222", 300),
    ]
    pipe.rename.assert_called_once_with(AIRCRAFT_ALL_NEXT_KEY, AIRCRAFT_ALL_KEY)
    assert call.delete(AIRCRAFT_ALL_KEY) not in pipe.method_calls
    pipe.execute.assert_awaited_once()
    mock_redis.set_json.assert_awaited_once()
    assert mock_redis.set_json.await_args.args[0] == AIRCRAFT_DATA_CACHE_KEY


@pytest.mark.asyncio
async def test_write_aircraft_clears_membership_when_list_is_empty(mock_redis):
    pipe = _pipeline_mock()
    mock_redis.pipeline.return_value = pipe

    count = await write_aircraft(mock_redis, [])

    assert count == 0
    assert pipe.method_calls[:2] == [
        call.delete(AIRCRAFT_ALL_NEXT_KEY),
        call.delete(AIRCRAFT_ALL_KEY),
    ]
    pipe.rename.assert_not_called()
    pipe.execute.assert_awaited_once()
    mock_redis.set_json.assert_awaited_once()
