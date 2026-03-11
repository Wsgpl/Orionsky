"""Shared pytest fixtures."""
import asyncio
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

# Set required env vars before importing app
import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars")
os.environ.setdefault("WEATHER_SOURCE", "openmeteo")
os.environ.setdefault("REDIS_HOST", "localhost")

from app.main import create_app
from app.cache.redis_client import RedisClient
from app.schemas.aircraft import AircraftState


@pytest.fixture
def mock_redis() -> RedisClient:
    r = MagicMock(spec=RedisClient)
    r.smembers = AsyncMock(return_value=set())
    r.hgetall = AsyncMock(return_value={})
    r.ping = AsyncMock(return_value=True)
    r.delete = AsyncMock(return_value=1)
    r.hset = AsyncMock(return_value=1)
    r.sadd = AsyncMock(return_value=1)
    r.get = AsyncMock(return_value=None)
    r.get_json = AsyncMock(return_value=None)
    r.set_json = AsyncMock(return_value=None)
    r.set = AsyncMock(return_value=None)
    r.expire = AsyncMock(return_value=None)
    r.keys = AsyncMock(return_value=[])
    pipe = MagicMock()
    pipe.delete = MagicMock(return_value=pipe)
    pipe.hset = MagicMock(return_value=pipe)
    pipe.expire = MagicMock(return_value=pipe)
    pipe.sadd = MagicMock(return_value=pipe)
    pipe.execute = AsyncMock(return_value=[])
    r.pipeline = MagicMock(return_value=pipe)
    return r


@pytest.fixture
def sample_aircraft() -> list[AircraftState]:
    return [
        AircraftState(
            icao="ABC123", callsign="FL100",
            latitude=20.0, longitude=77.0,
            altitude=35000.0, velocity=850.0, heading=90.0,
        ),
        AircraftState(
            icao="DEF456", callsign="FL200",
            latitude=20.001, longitude=77.001,
            altitude=35100.0, velocity=840.0, heading=270.0,
        ),
        AircraftState(
            icao="GHI789", callsign="FL300",
            latitude=30.0, longitude=85.0,
            altitude=38000.0, velocity=900.0, heading=45.0,
        ),
    ]
