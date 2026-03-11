from types import SimpleNamespace

import pytest

from app.ingestion import spire
from app.ingestion.spire import _fetch_raw, _parse_spire_target


def test_parse_spire_target_from_stream_payload() -> None:
    payload = {
        "target": {
            "icao_address": "49D13F",
            "timestamp": "2026-04-09T12:25:12Z",
            "latitude": 20.588472,
            "longitude": 86.816212,
            "altitude_baro": 30000,
            "heading": 70.52,
            "speed": 485.8,
            "on_ground": False,
            "callsign": "SEJ768",
            "aircraft_type_icao": "B738",
            "collection_type": "terrestrial",
        }
    }

    aircraft = _parse_spire_target(payload)

    assert aircraft is not None
    assert aircraft.icao == "49D13F"
    assert aircraft.callsign == "SEJ768"
    assert aircraft.altitude == 30000
    assert aircraft.heading == 70.52
    assert round(aircraft.velocity or 0, 3) == round(485.8 * 1.852, 3)
    assert aircraft.source == "spire"
    assert aircraft.aircraft_type == "B738"
    assert aircraft.category == "terrestrial"


@pytest.mark.parametrize("icao_address", ["ZZZZZZ", "49D1"])
def test_parse_spire_target_rejects_non_hex_or_truncated_icao(icao_address: str) -> None:
    payload = {
        "target": {
            "icao_address": icao_address,
            "latitude": 20.588472,
            "longitude": 86.816212,
            "altitude_baro": 30000,
            "heading": 70.52,
            "speed": 485.8,
            "on_ground": False,
        }
    }

    assert _parse_spire_target(payload) is None


@pytest.mark.asyncio
async def test_fetch_raw_does_not_send_query_params(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        request = SimpleNamespace()

        def raise_for_status(self) -> None:
            return None

        async def aiter_lines(self):
            yield (
                '{"target":{"icao_address":"49D13F","latitude":20.588472,"longitude":86.816212,'
                '"altitude_baro":30000,"heading":70.52,"speed":485.8,"on_ground":false}}'
            )

    class FakeStreamContext:
        async def __aenter__(self) -> FakeResponse:
            return FakeResponse()

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            captured["timeout"] = kwargs.get("timeout")

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        def stream(self, method: str, url: str, **kwargs) -> FakeStreamContext:
            captured["method"] = method
            captured["url"] = url
            captured["headers"] = kwargs.get("headers")
            captured["params"] = kwargs.get("params")
            return FakeStreamContext()

    monkeypatch.setattr(spire.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(spire.settings, "SPIRE_API_TOKEN", "test-token")
    monkeypatch.setattr(spire.settings, "SPIRE_API_URL", "https://api.airsafe.spire.com/v2/targets/stream")
    aircraft = await _fetch_raw()

    assert len(aircraft) == 1
    assert captured["method"] == "GET"
    assert captured["url"] == "https://api.airsafe.spire.com/v2/targets/stream"
    assert captured["params"] is None
