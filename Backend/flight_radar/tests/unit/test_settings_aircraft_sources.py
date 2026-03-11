import pytest

from app.core.config import Settings


def test_settings_accepts_spire_aircraft_source() -> None:
    settings = Settings(
        ENVIRONMENT="development",
        SECRET_KEY="x" * 32,
        AIRCRAFT_SOURCES="spire",
        SPIRE_API_TOKEN="test-token",
        REQUIRE_API_KEY=False,
    )

    assert settings.aircraft_sources == ["spire"]


def test_settings_rejects_unknown_aircraft_source() -> None:
    with pytest.raises(ValueError, match="Unknown AIRCRAFT_SOURCES values"):
        Settings(
            ENVIRONMENT="development",
            SECRET_KEY="x" * 32,
            AIRCRAFT_SOURCES="spire,unknown",
            SPIRE_API_TOKEN="test-token",
            REQUIRE_API_KEY=False,
        )
