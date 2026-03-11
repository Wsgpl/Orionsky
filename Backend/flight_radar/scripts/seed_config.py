"""
Seed script to populate initial configuration data.
Run this to set up default regions, thresholds, and rate limit plans.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import redis.asyncio as aioredis

from app.cache.redis_client import RedisClient, get_pool
from app.models.config import (
    Airport,
    ConflictParameters,
    DataSourceConfig,
    Location,
    RateLimitPlan,
    Region,
    SystemConfig,
    TenantConfig,
    UnitSystem,
    WeatherThresholds,
)
from app.repositories.config_repository import ConfigRepository

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_regions(repo: ConfigRepository) -> None:
    """Seed default regions."""
    logger.info("Seeding regions...")
    
    regions = [
        Region(
            id="india",
            name="India",
            min_lat=6.0,
            max_lat=38.0,
            min_lon=68.0,
            max_lon=98.0,
            weather_grid_step=3.0,
            timezone="Asia/Kolkata",
        ),
        Region(
            id="usa",
            name="United States",
            min_lat=24.0,
            max_lat=50.0,
            min_lon=-125.0,
            max_lon=-66.0,
            weather_grid_step=5.0,
            timezone="America/New_York",
        ),
        Region(
            id="europe",
            name="Europe",
            min_lat=35.0,
            max_lat=71.0,
            min_lon=-10.0,
            max_lon=40.0,
            weather_grid_step=4.0,
            timezone="Europe/London",
        ),
        Region(
            id="asia_pacific",
            name="Asia Pacific",
            min_lat=-10.0,
            max_lat=50.0,
            min_lon=95.0,
            max_lon=180.0,
            weather_grid_step=5.0,
            timezone="Asia/Tokyo",
        ),
    ]
    
    for region in regions:
        await repo.set_region(region)
        logger.info(f"  ✓ Region: {region.name}")


async def seed_weather_thresholds(repo: ConfigRepository) -> None:
    """Seed weather thresholds."""
    logger.info("Seeding weather thresholds...")
    
    # Global default
    global_thresholds = WeatherThresholds(
        id="global_default",
        name="Global Default Thresholds",
        wind_severe=20.0,
        wind_moderate=12.0,
        visibility_very_low=2000.0,
        visibility_reduced=5000.0,
        cloud_cover_dense=90.0,
        precipitation_keywords=["rain", "storm", "thunder", "snow", "hail", "drizzle"],
    )
    await repo.set_weather_thresholds(global_thresholds)
    logger.info("  ✓ Global weather thresholds")
    
    # India-specific (more conservative for monsoon season)
    india_thresholds = WeatherThresholds(
        id="india_thresholds",
        region_id="india",
        name="India Weather Thresholds",
        wind_severe=18.0,
        wind_moderate=10.0,
        visibility_very_low=1500.0,
        visibility_reduced=4000.0,
        cloud_cover_dense=85.0,
        precipitation_keywords=["rain", "storm", "thunder", "monsoon", "cyclone"],
    )
    await repo.set_weather_thresholds(india_thresholds)
    logger.info("  ✓ India weather thresholds")


async def seed_conflict_parameters(repo: ConfigRepository) -> None:
    """Seed conflict detection parameters."""
    logger.info("Seeding conflict parameters...")
    
    airspace_classes = {
        "A": ConflictParameters(
            id="class_a",
            airspace_class="A",
            name="Class A (IFR only)",
            horizontal_separation_km=9.26,  # 5 NM
            vertical_separation_ft=1000.0,
            lookahead_seconds=600,
        ),
        "B": ConflictParameters(
            id="class_b",
            airspace_class="B",
            name="Class B (Major airports)",
            horizontal_separation_km=5.56,  # 3 NM
            vertical_separation_ft=1000.0,
            lookahead_seconds=480,
        ),
        "C": ConflictParameters(
            id="class_c",
            airspace_class="C",
            name="Class C (Controlled)",
            horizontal_separation_km=5.56,  # 3 NM
            vertical_separation_ft=500.0,
            lookahead_seconds=420,
        ),
        "D": ConflictParameters(
            id="class_d",
            airspace_class="D",
            name="Class D (Controlled)",
            horizontal_separation_km=3.70,  # 2 NM
            vertical_separation_ft=500.0,
            lookahead_seconds=360,
        ),
        "E": ConflictParameters(
            id="class_e",
            airspace_class="E",
            name="Class E (Controlled)",
            horizontal_separation_km=5.56,  # 3 NM
            vertical_separation_ft=500.0,
            lookahead_seconds=300,
        ),
        "G": ConflictParameters(
            id="class_g",
            airspace_class="G",
            name="Class G (Uncontrolled)",
            horizontal_separation_km=1.85,  # 1 NM
            vertical_separation_ft=500.0,
            lookahead_seconds=240,
        ),
    }
    
    for params in airspace_classes.values():
        await repo.set_conflict_parameters(params)
        logger.info(f"  ✓ Airspace Class {params.airspace_class}")


async def seed_rate_limit_plans(repo: ConfigRepository) -> None:
    """Seed rate limit plans."""
    logger.info("Seeding rate limit plans...")
    
    plans = [
        RateLimitPlan(
            id="free",
            name="free",
            display_name="Free Plan",
            requests_per_minute=60,
            requests_per_hour=1000,
            requests_per_day=10000,
            features=["basic_aircraft", "basic_weather"],
            price_monthly=0.0,
        ),
        RateLimitPlan(
            id="pro",
            name="pro",
            display_name="Pro Plan",
            requests_per_minute=300,
            requests_per_hour=10000,
            requests_per_day=100000,
            features=["basic_aircraft", "basic_weather", "forecasts", "advisories"],
            price_monthly=49.0,
        ),
        RateLimitPlan(
            id="enterprise",
            name="enterprise",
            display_name="Enterprise Plan",
            requests_per_minute=1200,
            requests_per_hour=50000,
            requests_per_day=500000,
            features=["all"],
            price_monthly=299.0,
        ),
    ]
    
    for plan in plans:
        await repo.set_rate_limit_plan(plan)
        logger.info(f"  ✓ Plan: {plan.display_name}")


async def seed_system_config(repo: ConfigRepository) -> None:
    """Seed system configuration."""
    logger.info("Seeding system config...")
    
    config = SystemConfig(
        default_region_id="india",
        default_unit_system=UnitSystem.METRIC,
        default_language="en",
        earth_radius_km=6371.0,
        use_wgs84_ellipsoid=False,
        default_aircraft_poll_interval=15,
        default_weather_poll_interval=300,
        default_cache_ttl=600,
        jwt_expire_minutes=60,
        api_key_min_length=32,
        default_rate_limit_requests=60,
        default_rate_limit_window=60,
        enable_multi_tenancy=False,
        enable_white_label=False,
        enable_i18n=True,
    )
    
    await repo.set_system_config(config)
    logger.info("  ✓ System configuration")


async def seed_sample_airports(repo: ConfigRepository) -> None:
    """Seed sample airports."""
    logger.info("Seeding sample airports...")
    
    airports = [
        Airport(
            id="VIDP",
            icao="VIDP",
            iata="DEL",
            name="Indira Gandhi International Airport",
            city="New Delhi",
            country="India",
            region_id="india",
            latitude=28.5665,
            longitude=77.1031,
            elevation_ft=777,
            timezone="Asia/Kolkata",
        ),
        Airport(
            id="VABB",
            icao="VABB",
            iata="BOM",
            name="Chhatrapati Shivaji Maharaj International Airport",
            city="Mumbai",
            country="India",
            region_id="india",
            latitude=19.0896,
            longitude=72.8656,
            elevation_ft=39,
            timezone="Asia/Kolkata",
        ),
        Airport(
            id="VOBL",
            icao="VOBL",
            iata="BLR",
            name="Kempegowda International Airport",
            city="Bangalore",
            country="India",
            region_id="india",
            latitude=13.1979,
            longitude=77.7063,
            elevation_ft=3000,
            timezone="Asia/Kolkata",
        ),
    ]
    
    await repo.bulk_set_airports(airports)
    logger.info(f"  ✓ {len(airports)} airports")


async def seed_sample_locations(repo: ConfigRepository) -> None:
    """Seed sample locations."""
    logger.info("Seeding sample locations...")
    
    locations = [
        Location(
            id="delhi",
            name="Delhi",
            display_name="New Delhi, India",
            country="India",
            region_id="india",
            latitude=28.6139,
            longitude=77.2090,
            type="city",
        ),
        Location(
            id="mumbai",
            name="Mumbai",
            display_name="Mumbai, India",
            country="India",
            region_id="india",
            latitude=19.0760,
            longitude=72.8777,
            type="city",
        ),
        Location(
            id="bangalore",
            name="Bangalore",
            display_name="Bangalore, India",
            country="India",
            region_id="india",
            latitude=12.9716,
            longitude=77.5946,
            type="city",
        ),
    ]
    
    await repo.bulk_set_locations(locations)
    logger.info(f"  ✓ {len(locations)} locations")


async def seed_data_sources(repo: ConfigRepository) -> None:
    """Seed data source configurations."""
    logger.info("Seeding data sources...")
    
    sources = [
        DataSourceConfig(
            id="opensky_aircraft",
            name="OpenSky Network",
            type="aircraft",
            provider="opensky",
            base_url="https://opensky-network.org/api/states/all",
            timeout_seconds=15.0,
            poll_interval_seconds=15,
            max_retries=3,
            backoff_factor=2.0,
            cb_failure_threshold=5,
            cb_recovery_timeout_seconds=60,
            priority=10,
        ),
        DataSourceConfig(
            id="adsblol_aircraft",
            name="ADSB.lol",
            type="aircraft",
            provider="adsblol",
            base_url="https://api.adsb.lol",
            timeout_seconds=15.0,
            poll_interval_seconds=15,
            max_retries=3,
            backoff_factor=2.0,
            cb_failure_threshold=5,
            cb_recovery_timeout_seconds=60,
            priority=20,
        ),
        DataSourceConfig(
            id="openmeteo_weather",
            name="Open-Meteo",
            type="weather",
            provider="openmeteo",
            base_url="https://api.open-meteo.com/v1/forecast",
            timeout_seconds=20.0,
            poll_interval_seconds=300,
            max_retries=3,
            backoff_factor=2.0,
            cb_failure_threshold=5,
            cb_recovery_timeout_seconds=120,
            cache_ttl_seconds=600,
            priority=10,
        ),
    ]
    
    for source in sources:
        await repo.set_data_source(source)
        logger.info(f"  ✓ {source.name} ({source.type})")


async def main() -> None:
    """Run all seed functions."""
    logger.info("Starting configuration seed...")
    
    pool = get_pool()
    client = aioredis.Redis(connection_pool=pool, decode_responses=True)
    redis = RedisClient(client)
    repo = ConfigRepository(redis)
    
    try:
        await seed_system_config(repo)
        await seed_regions(repo)
        await seed_weather_thresholds(repo)
        await seed_conflict_parameters(repo)
        await seed_rate_limit_plans(repo)
        await seed_sample_airports(repo)
        await seed_sample_locations(repo)
        await seed_data_sources(repo)
        
        logger.info("✅ Configuration seed completed successfully!")
    except Exception as exc:
        logger.error(f"❌ Seed failed: {exc}", exc_info=True)
        raise
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
