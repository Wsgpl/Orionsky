from fastapi.testclient import TestClient

from app import main as main_app


async def _noop_worker() -> None:
    return None


def test_legacy_routes_redirect_to_prefixed_endpoints(monkeypatch) -> None:
    monkeypatch.setattr(main_app.settings, "ENABLE_LEGACY_UNPREFIXED_ROUTES", True)
    monkeypatch.setattr(main_app, "aircraft_ingestion_loop", _noop_worker)
    monkeypatch.setattr(main_app, "weather_ingestion_loop", _noop_worker)
    monkeypatch.setattr(main_app, "_background_tasks", [])

    with TestClient(main_app.create_app()) as client:
        aircraft_response = client.get("/aircraft", follow_redirects=False)
        auth_response = client.post("/auth/token", follow_redirects=False)

    assert aircraft_response.status_code == 307
    assert aircraft_response.headers["location"].endswith("/api/v1/aircraft")
    assert auth_response.status_code == 307
    assert auth_response.headers["location"].endswith("/api/v1/auth/token")


def test_legacy_routes_are_not_mounted_when_redirects_are_disabled(monkeypatch) -> None:
    monkeypatch.setattr(main_app.settings, "ENABLE_LEGACY_UNPREFIXED_ROUTES", False)
    monkeypatch.setattr(main_app, "aircraft_ingestion_loop", _noop_worker)
    monkeypatch.setattr(main_app, "weather_ingestion_loop", _noop_worker)
    monkeypatch.setattr(main_app, "_background_tasks", [])

    with TestClient(main_app.create_app()) as client:
        response = client.get("/aircraft", follow_redirects=False)

    assert response.status_code == 404
