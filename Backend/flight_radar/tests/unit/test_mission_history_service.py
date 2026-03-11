"""Unit tests for mission-history persistence."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.schemas.mission_history import MissionHistoryItem, MissionHistorySaveRequest
from app.services.mission_history_service import list_mission_history, save_mission_history


def _mission_payload(name: str, geometry_type: str = "LineString") -> dict:
    if geometry_type == "Polygon":
        coordinates = [
            {"lat": 28.0, "lon": 77.0},
            {"lat": 28.2, "lon": 77.3},
            {"lat": 28.1, "lon": 77.5},
        ]
    else:
        coordinates = [
            {"lat": 28.0, "lon": 77.0},
            {"lat": 28.2, "lon": 77.3},
            {"lat": 28.4, "lon": 77.8},
        ]

    return {
        "metadata": {
            "name": name,
            "tags": ["saved"],
        },
        "geometry": {
            "type": geometry_type,
            "name": name,
            "coordinates": coordinates,
        },
    }


@pytest.mark.asyncio
async def test_save_mission_history_persists_named_mission(mock_redis):
    payload = MissionHistorySaveRequest(
        mission=_mission_payload("Delhi Patrol"),
        sample_spacing_km=50,
    )

    item = await save_mission_history(mock_redis, "user:pilot@example.com", payload)

    assert item.mission_name == "Delhi Patrol"
    assert item.geometry_type == "LineString"
    assert item.coordinate_count == 3
    assert item.sample_spacing_km == 50
    mock_redis.set_json.assert_awaited_once()
    saved_key = mock_redis.set_json.await_args.args[0]
    saved_payload = mock_redis.set_json.await_args.args[1]
    assert saved_key.startswith("mission_history:")
    assert saved_payload["mission_name"] == "Delhi Patrol"


@pytest.mark.asyncio
async def test_list_mission_history_returns_latest_first(mock_redis):
    now = datetime.now(timezone.utc)
    older = MissionHistoryItem(
        mission_id="older",
        mission_name="Morning Patrol",
        geometry_type="LineString",
        coordinate_count=3,
        sample_spacing_km=100,
        saved_at=now - timedelta(hours=2),
        updated_at=now - timedelta(hours=2),
        mission=_mission_payload("Morning Patrol"),
    )
    newer = MissionHistoryItem(
        mission_id="newer",
        mission_name="Evening Patrol",
        geometry_type="Polygon",
        coordinate_count=4,
        sample_spacing_km=None,
        saved_at=now,
        updated_at=now,
        mission=_mission_payload("Evening Patrol", geometry_type="Polygon"),
    )
    mock_redis.keys.return_value = ["mission_history:user:older", "mission_history:user:newer"]
    mock_redis.get_json.side_effect = [
        older.model_dump(mode="json"),
        newer.model_dump(mode="json"),
    ]

    response = await list_mission_history(mock_redis, "user:pilot@example.com")

    assert response.count == 2
    assert [item.mission_id for item in response.missions] == ["newer", "older"]
