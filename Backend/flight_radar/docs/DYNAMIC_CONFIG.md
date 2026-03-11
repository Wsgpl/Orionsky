# Dynamic Configuration Architecture

## Overview

The Flight Radar system has been refactored to eliminate hardcoded values and support:

- **Multi-region deployment** - Track aircraft anywhere in the world
- **Dynamic thresholds** - Configurable weather advisory rules per region
- **Multi-tenancy** - Support multiple customers with isolated configs
- **White-label** - Customizable branding per tenant
- **Unit preferences** - Metric, Imperial, or Mixed unit systems
- **Internationalization** - Multi-language support
- **Flexible data sources** - Configure external APIs dynamically
- **Adaptive rate limiting** - Plan-based quotas

## Architecture Components

### 1. Configuration Models (`app/models/config.py`)

All configuration is now stored as Pydantic models:

- **Region** - Geographic boundaries, grid step, timezone
- **WeatherThresholds** - Wind, visibility, cloud cover limits
- **ConflictParameters** - Separation standards by airspace class
- **RateLimitPlan** - API quota tiers
- **TenantConfig** - Multi-tenant settings
- **Airport** - Airport/aerodrome data
- **Location** - Named locations (cities, landmarks)
- **DataSourceConfig** - External API configurations
- **SystemConfig** - Global system settings

### 2. Configuration Repository (`app/repositories/config_repository.py`)

Loads configuration from Redis with caching and fallback to defaults:

```python
from app.repositories.config_repository import ConfigRepository

repo = ConfigRepository(redis)

# Load region
region = await repo.get_region("india")

# Load weather thresholds (region-specific or global)
thresholds = await repo.get_weather_thresholds("india")

# Load conflict parameters by airspace class
params = await repo.get_conflict_parameters("A", region_id="india")
```

### 3. Unit Conversion (`app/utils/units.py`)

Dynamic unit conversion based on user/tenant preferences:

```python
from app.utils.units import UnitConverter
from app.models.config import TemperatureUnit, SpeedUnit

# Temperature conversion
fahrenheit = UnitConverter.convert_temperature(
    25.0, TemperatureUnit.CELSIUS, TemperatureUnit.FAHRENHEIT
)

# Speed conversion
knots = UnitConverter.convert_speed(
    850.0, SpeedUnit.KMH, SpeedUnit.KNOTS
)
```

### 4. Earth Model (`app/utils/units.py`)

Configurable Earth geometry (mean radius or WGS84 ellipsoid):

```python
from app.utils.units import EarthModel

# Use WGS84 ellipsoid for higher accuracy
earth = EarthModel(use_wgs84=True)
distance = earth.haversine_distance(lat1, lon1, lat2, lon2)
```

### 5. Internationalization (`app/utils/i18n.py`)

Multi-language support with Redis-backed translations:

```python
from app.utils.i18n import I18n

i18n = I18n(redis, default_locale="en")
text = await i18n.get("app.name", locale="es")  # "Radar de Vuelo Inteligente"
```

## Setup & Seeding

### 1. Seed Initial Configuration

Run the seed script to populate default regions, thresholds, and plans:

```bash
cd Backend/flight_radar
python scripts/seed_config.py
```

This creates:
- 4 regions (India, USA, Europe, Asia Pacific)
- Global and India-specific weather thresholds
- 6 airspace class conflict parameters (A-G)
- 3 rate limit plans (Free, Pro, Enterprise)
- Sample airports and locations
- Data source configurations
- Default translations (EN, ES, FR)

### 2. Configuration API Endpoints

All configuration is manageable via REST API (admin-only):

#### System Config
```bash
GET  /api/v1/config/system
PUT  /api/v1/config/system
```

#### Regions
```bash
GET  /api/v1/config/regions
GET  /api/v1/config/regions/{region_id}
POST /api/v1/config/regions
PUT  /api/v1/config/regions/{region_id}
```

#### Weather Thresholds
```bash
GET  /api/v1/config/weather-thresholds?region_id=india
POST /api/v1/config/weather-thresholds
```

#### Conflict Parameters
```bash
GET  /api/v1/config/conflict-parameters/{airspace_class}?region_id=india
POST /api/v1/config/conflict-parameters
```

#### Rate Limit Plans
```bash
GET  /api/v1/config/rate-plans
GET  /api/v1/config/rate-plans/{plan_id}
POST /api/v1/config/rate-plans
```

#### Airports & Locations
```bash
GET  /api/v1/config/airports?region_id=india
POST /api/v1/config/airports
POST /api/v1/config/airports/bulk

GET  /api/v1/config/locations?region_id=india
POST /api/v1/config/locations
POST /api/v1/config/locations/bulk
```

#### Data Sources
```bash
GET  /api/v1/config/data-sources?type=aircraft
GET  /api/v1/config/data-sources/{source_id}
POST /api/v1/config/data-sources
```

## Usage Examples

### Example 1: Add a New Region

```bash
curl -X POST http://localhost:8000/api/v1/config/regions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "australia",
    "name": "Australia",
    "min_lat": -44.0,
    "max_lat": -10.0,
    "min_lon": 113.0,
    "max_lon": 154.0,
    "weather_grid_step": 4.0,
    "timezone": "Australia/Sydney",
    "active": true
  }'
```

### Example 2: Customize Weather Thresholds

```bash
curl -X POST http://localhost:8000/api/v1/config/weather-thresholds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "australia_thresholds",
    "region_id": "australia",
    "name": "Australia Weather Thresholds",
    "wind_severe": 25.0,
    "wind_moderate": 15.0,
    "visibility_very_low": 1000.0,
    "visibility_reduced": 3000.0,
    "cloud_cover_dense": 95.0,
    "precipitation_keywords": ["rain", "storm", "cyclone", "hail"],
    "active": true
  }'
```

### Example 3: Create Custom Rate Plan

```bash
curl -X POST http://localhost:8000/api/v1/config/rate-plans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "startup",
    "name": "startup",
    "display_name": "Startup Plan",
    "requests_per_minute": 150,
    "requests_per_hour": 5000,
    "requests_per_day": 50000,
    "features": ["basic_aircraft", "basic_weather", "forecasts"],
    "price_monthly": 19.0,
    "active": true
  }'
```

### Example 4: Bulk Import Airports

```python
import asyncio
import httpx

airports = [
    {
        "id": "YSSY",
        "icao": "YSSY",
        "iata": "SYD",
        "name": "Sydney Kingsford Smith Airport",
        "city": "Sydney",
        "country": "Australia",
        "region_id": "australia",
        "latitude": -33.9461,
        "longitude": 151.1772,
        "elevation_ft": 21,
        "timezone": "Australia/Sydney",
        "active": True
    },
    # ... more airports
]

async def bulk_import():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/api/v1/config/airports/bulk",
            json=airports,
            headers={"Authorization": f"Bearer {token}"}
        )
        print(response.json())

asyncio.run(bulk_import())
```

## Multi-Tenancy

### Enable Multi-Tenancy

Update system config:

```bash
curl -X PUT http://localhost:8000/api/v1/config/system \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "system",
    "default_region_id": "india",
    "enable_multi_tenancy": true,
    "enable_white_label": true,
    ...
  }'
```

### Create Tenant

```python
from app.models.config import TenantConfig, UnitSystem

tenant = TenantConfig(
    id="acme_aviation",
    name="ACME Aviation",
    slug="acme",
    display_name="ACME Flight Tracker",
    logo_url="https://cdn.acme.com/logo.png",
    primary_color="#FF5722",
    default_region_id="usa",
    allowed_region_ids=["usa", "europe"],
    unit_system=UnitSystem.IMPERIAL,
    redis_namespace="tenant:acme",
    rate_limit_plan_id="enterprise",
    features={
        "advanced_weather": True,
        "conflict_detection": True,
        "custom_branding": True
    },
    active=True
)

await repo.set_tenant(tenant)
```

## Frontend Integration

### 1. Fetch Available Regions

```typescript
const regions = await api.get<Region[]>('/api/v1/config/regions');
```

### 2. Load Airports for Region

```typescript
const airports = await api.get<Airport[]>('/api/v1/config/airports', {
  params: { region_id: 'india' }
});
```

### 3. Get Translations

```typescript
const i18n = await api.get<Record<string, string>>('/api/v1/i18n/en');
```

## Migration from Hardcoded Values

### Before (Hardcoded)

```python
# Old hardcoded approach
if weather.wind_speed > 20:
    warnings.append("Severe wind")
```

### After (Dynamic)

```python
# New dynamic approach
thresholds = await repo.get_weather_thresholds(region_id)
if weather.wind_speed > thresholds.wind_severe:
    warnings.append("Severe wind")
```

## Benefits

### 1. Regional Flexibility
- Deploy in any country without code changes
- Customize thresholds per region (e.g., monsoon vs desert)

### 2. Business Agility
- Add new rate plans without deployment
- A/B test different threshold values
- Adjust pricing dynamically

### 3. White-Label Ready
- Rebrand for different customers
- Isolated data per tenant
- Custom feature flags

### 4. Internationalization
- Support any language
- Localized units (metric/imperial)
- Regional date/time formats

### 5. Operational Excellence
- Monitor configuration changes
- Rollback bad configs instantly
- No downtime for config updates

## Best Practices

### 1. Always Use Repository Pattern

```python
# ✅ Good
repo = ConfigRepository(redis)
thresholds = await repo.get_weather_thresholds(region_id)

# ❌ Bad
raw = await redis.get("config:weather_thresholds:india")
```

### 2. Cache Configuration

```python
# Cache in memory for hot path
_threshold_cache: dict[str, WeatherThresholds] = {}

async def get_cached_thresholds(region_id: str) -> WeatherThresholds:
    if region_id not in _threshold_cache:
        _threshold_cache[region_id] = await repo.get_weather_thresholds(region_id)
    return _threshold_cache[region_id]
```

### 3. Validate Configuration

```python
# Use Pydantic validation
try:
    region = Region(**data)
except ValidationError as e:
    logger.error(f"Invalid region config: {e}")
```

### 4. Version Configuration

```python
# Add version field to track changes
class Region(BaseModel):
    id: str
    version: int = 1
    updated_at: datetime
    updated_by: str
```

## Troubleshooting

### Configuration Not Loading

```bash
# Check Redis connection
redis-cli -h localhost -p 6379 ping

# List all config keys
redis-cli --scan --pattern "config:*"

# Get specific config
redis-cli GET "config:region:india"
```

### Seed Script Fails

```bash
# Check Redis is running
docker ps | grep redis

# Run with debug logging
LOG_LEVEL=DEBUG python scripts/seed_config.py
```

### API Returns Default Values

```bash
# Verify config exists in Redis
redis-cli GET "config:weather_thresholds:india"

# Check repository namespace
# Default is "config", ensure it matches
```

## Future Enhancements

- [ ] Configuration versioning and audit log
- [ ] Configuration UI dashboard
- [ ] Import/export configuration as JSON/YAML
- [ ] Configuration validation rules engine
- [ ] A/B testing framework for thresholds
- [ ] Machine learning for optimal threshold tuning
- [ ] Geographic-based auto-configuration
- [ ] Configuration templates library
