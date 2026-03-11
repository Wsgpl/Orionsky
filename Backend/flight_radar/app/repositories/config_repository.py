"""
Configuration repository - loads dynamic configuration from Redis.
Provides caching and fallback to defaults.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.cache.redis_client import RedisClient
from app.models.config import (
    Airport,
    ConflictParameters,
    DataSourceConfig,
    Location,
    RateLimitPlan,
    Region,
    SystemConfig,
    TenantConfig,
    WeatherThresholds,
)

logger = logging.getLogger(__name__)


class ConfigRepository:
    """Repository for loading dynamic configuration from Redis."""

    def __init__(self, redis: RedisClient, namespace: str = "config"):
        self.redis = redis
        self.namespace = namespace

    def _key(self, *parts: str) -> str:
        """Build namespaced Redis key."""
        return f"{self.namespace}:{':'.join(parts)}"

    async def get_system_config(self) -> SystemConfig:
        """Load system configuration."""
        key = self._key("system")
        data = await self.redis.get_json(key)
        if data:
            return SystemConfig(**data)
        
        # Return default
        return SystemConfig(default_region_id="india")

    async def set_system_config(self, config: SystemConfig) -> None:
        """Save system configuration."""
        key = self._key("system")
        await self.redis.set_json(key, config.model_dump())

    async def get_region(self, region_id: str) -> Region | None:
        """Load region configuration."""
        key = self._key("region", region_id)
        data = await self.redis.get_json(key)
        if data:
            return Region(**data)
        return None

    async def list_regions(self, active_only: bool = True) -> list[Region]:
        """List all regions."""
        pattern = self._key("region", "*")
        keys = await self.redis.keys(pattern)
        regions: list[Region] = []
        
        for key in keys:
            data = await self.redis.get_json(key)
            if data:
                region = Region(**data)
                if not active_only or region.active:
                    regions.append(region)
        
        return regions

    async def set_region(self, region: Region) -> None:
        """Save region configuration."""
        key = self._key("region", region.id)
        await self.redis.set_json(key, region.model_dump())

    async def get_weather_thresholds(
        self, region_id: str | None = None
    ) -> WeatherThresholds:
        """Load weather thresholds for region, fallback to global."""
        if region_id:
            key = self._key("weather_thresholds", region_id)
            data = await self.redis.get_json(key)
            if data:
                return WeatherThresholds(**data)
        
        # Try global default
        key = self._key("weather_thresholds", "global")
        data = await self.redis.get_json(key)
        if data:
            return WeatherThresholds(**data)
        
        # Return hardcoded default
        return WeatherThresholds(
            id="default",
            name="Default Weather Thresholds",
        )

    async def set_weather_thresholds(self, thresholds: WeatherThresholds) -> None:
        """Save weather thresholds."""
        region_key = thresholds.region_id or "global"
        key = self._key("weather_thresholds", region_key)
        await self.redis.set_json(key, thresholds.model_dump())

    async def get_conflict_parameters(
        self, airspace_class: str, region_id: str | None = None
    ) -> ConflictParameters:
        """Load conflict parameters for airspace class and region."""
        if region_id:
            key = self._key("conflict_params", region_id, airspace_class)
            data = await self.redis.get_json(key)
            if data:
                return ConflictParameters(**data)
        
        # Try global default
        key = self._key("conflict_params", "global", airspace_class)
        data = await self.redis.get_json(key)
        if data:
            return ConflictParameters(**data)
        
        # Return hardcoded default
        return ConflictParameters(
            id=f"default_{airspace_class}",
            airspace_class=airspace_class,
            name=f"Default Class {airspace_class}",
        )

    async def set_conflict_parameters(self, params: ConflictParameters) -> None:
        """Save conflict parameters."""
        region_key = params.region_id or "global"
        key = self._key("conflict_params", region_key, params.airspace_class)
        await self.redis.set_json(key, params.model_dump())

    async def get_rate_limit_plan(self, plan_id: str) -> RateLimitPlan | None:
        """Load rate limit plan."""
        key = self._key("rate_plan", plan_id)
        data = await self.redis.get_json(key)
        if data:
            return RateLimitPlan(**data)
        return None

    async def list_rate_limit_plans(self, active_only: bool = True) -> list[RateLimitPlan]:
        """List all rate limit plans."""
        pattern = self._key("rate_plan", "*")
        keys = await self.redis.keys(pattern)
        plans: list[RateLimitPlan] = []
        
        for key in keys:
            data = await self.redis.get_json(key)
            if data:
                plan = RateLimitPlan(**data)
                if not active_only or plan.active:
                    plans.append(plan)
        
        return plans

    async def set_rate_limit_plan(self, plan: RateLimitPlan) -> None:
        """Save rate limit plan."""
        key = self._key("rate_plan", plan.id)
        await self.redis.set_json(key, plan.model_dump())

    async def get_tenant(self, tenant_id: str) -> TenantConfig | None:
        """Load tenant configuration."""
        key = self._key("tenant", tenant_id)
        data = await self.redis.get_json(key)
        if data:
            return TenantConfig(**data)
        return None

    async def get_tenant_by_slug(self, slug: str) -> TenantConfig | None:
        """Load tenant by slug."""
        # In production, use a secondary index
        pattern = self._key("tenant", "*")
        keys = await self.redis.keys(pattern)
        
        for key in keys:
            data = await self.redis.get_json(key)
            if data and data.get("slug") == slug:
                return TenantConfig(**data)
        
        return None

    async def set_tenant(self, tenant: TenantConfig) -> None:
        """Save tenant configuration."""
        key = self._key("tenant", tenant.id)
        await self.redis.set_json(key, tenant.model_dump())

    async def list_airports(self, region_id: str | None = None) -> list[Airport]:
        """List airports, optionally filtered by region."""
        pattern = self._key("airport", "*")
        keys = await self.redis.keys(pattern)
        airports: list[Airport] = []
        
        for key in keys:
            data = await self.redis.get_json(key)
            if data:
                airport = Airport(**data)
                if region_id is None or airport.region_id == region_id:
                    if airport.active:
                        airports.append(airport)
        
        return airports

    async def set_airport(self, airport: Airport) -> None:
        """Save airport."""
        key = self._key("airport", airport.id)
        await self.redis.set_json(key, airport.model_dump())

    async def bulk_set_airports(self, airports: list[Airport]) -> None:
        """Bulk save airports."""
        pipe = self.redis.pipeline(transaction=False)
        for airport in airports:
            key = self._key("airport", airport.id)
            pipe.set(key, json.dumps(airport.model_dump(), default=str))
        await pipe.execute()

    async def list_locations(self, region_id: str | None = None) -> list[Location]:
        """List locations, optionally filtered by region."""
        pattern = self._key("location", "*")
        keys = await self.redis.keys(pattern)
        locations: list[Location] = []
        
        for key in keys:
            data = await self.redis.get_json(key)
            if data:
                location = Location(**data)
                if region_id is None or location.region_id == region_id:
                    if location.active:
                        locations.append(location)
        
        return locations

    async def set_location(self, location: Location) -> None:
        """Save location."""
        key = self._key("location", location.id)
        await self.redis.set_json(key, location.model_dump())

    async def bulk_set_locations(self, locations: list[Location]) -> None:
        """Bulk save locations."""
        pipe = self.redis.pipeline(transaction=False)
        for location in locations:
            key = self._key("location", location.id)
            pipe.set(key, json.dumps(location.model_dump(), default=str))
        await pipe.execute()

    async def get_data_source(self, source_id: str) -> DataSourceConfig | None:
        """Load data source configuration."""
        key = self._key("data_source", source_id)
        data = await self.redis.get_json(key)
        if data:
            return DataSourceConfig(**data)
        return None

    async def list_data_sources(
        self, type: str | None = None, active_only: bool = True
    ) -> list[DataSourceConfig]:
        """List data sources, optionally filtered by type."""
        pattern = self._key("data_source", "*")
        keys = await self.redis.keys(pattern)
        sources: list[DataSourceConfig] = []
        
        for key in keys:
            data = await self.redis.get_json(key)
            if data:
                source = DataSourceConfig(**data)
                if type is None or source.type == type:
                    if not active_only or source.active:
                        sources.append(source)
        
        # Sort by priority
        sources.sort(key=lambda s: s.priority)
        return sources

    async def set_data_source(self, source: DataSourceConfig) -> None:
        """Save data source configuration."""
        key = self._key("data_source", source.id)
        await self.redis.set_json(key, source.model_dump())


async def get_config_repo(redis: RedisClient) -> ConfigRepository:
    """Factory function for dependency injection."""
    return ConfigRepository(redis)
