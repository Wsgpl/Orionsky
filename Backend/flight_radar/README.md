# ✈️ FlightRadar Intelligence Backend

Production-grade real-time airspace monitoring system.

## Architecture

```
app/
├── core/           # Config, logging, JWT, dependency injection
├── api/v1/         # FastAPI route handlers (thin — no business logic)
├── schemas/        # Pydantic I/O models
├── services/       # Business logic orchestration (Redis ↔ engines)
├── engines/        # Pure-logic: conflict detection, movement, advisories
├── ingestion/      # External API clients: OpenSky/ADSB.lol/ICAO + OpenWeather/AviationWeather
├── cache/          # Redis abstraction layer
├── middleware/     # Request tracking, rate limiting, exception handling
└── workers/        # Async background ingestion loops
```

## Quick Start

### Local Development

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — set SECRET_KEY, and weather source credentials
# Optional for non-demo auth: AUTH_PASSWORD_HASH

# 2. Start Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run development server
make dev
# or: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Visit: http://localhost:8000/docs

### Docker Deployment

```bash
cp .env.example .env
# Set SECRET_KEY and weather source credentials in .env
# Optional for non-demo auth: AUTH_PASSWORD_HASH

docker-compose up -d

# Check logs
docker-compose logs -f api

# Health check
curl http://localhost:8000/health/ready
```

### Production Deployment

```bash
# 1. Build the production image
docker build -t flightradar-api:latest .

# 2. Push to your registry
docker tag flightradar-api:latest registry.example.com/flightradar-api:latest
docker push registry.example.com/flightradar-api:latest

# 3. Set production environment variables
SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
export ENVIRONMENT=production
export SECRET_KEY=<generated above>
export AUTH_USERNAME=<admin-username>
export AUTH_PASSWORD_HASH=<bcrypt-hash>
export CORS_ALLOWED_ORIGINS=<https://your-frontend-domain>
export WEATHER_SOURCE=<openweather|aviationweather|icao>
export OPENWEATHER_API_KEY=<your key if WEATHER_SOURCE=openweather>
export ICAO_WEATHER_URL=<url if WEATHER_SOURCE=icao>
export REDIS_HOST=<your redis host>
export REDIS_PASSWORD=<your redis password>

# 4. Run
docker run -d \
  -e ENVIRONMENT=production \
  -e SECRET_KEY=$SECRET_KEY \
  -e AUTH_USERNAME=$AUTH_USERNAME \
  -e AUTH_PASSWORD_HASH=$AUTH_PASSWORD_HASH \
  -e CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS \
  -e WEATHER_SOURCE=$WEATHER_SOURCE \
  -e OPENWEATHER_API_KEY=$OPENWEATHER_API_KEY \
  -e ICAO_WEATHER_URL=$ICAO_WEATHER_URL \
  -e REDIS_HOST=$REDIS_HOST \
  -e REDIS_PASSWORD=$REDIS_PASSWORD \
  -p 8000:8000 \
  --restart unless-stopped \
  flightradar-api:latest
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | ✅ | JWT signing secret (≥32 chars). Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `AUTH_USERNAME` | ✅ | Login username for `/api/v1/auth/token` |
| `AUTH_PASSWORD_HASH` | ✅ (production) | bcrypt hash for `AUTH_USERNAME` password. Generate via `make auth-hash` |
| `AIRCRAFT_SOURCES` | | Comma-separated aircraft feeds: `opensky,adsblol,icao` (default: `opensky`) |
| `WEATHER_SOURCE` | | Weather provider: `openweather` / `aviationweather` / `icao` |
| `OPENWEATHER_API_KEY` | ✅ when `WEATHER_SOURCE=openweather` | OpenWeatherMap API key from https://openweathermap.org/api |
| `AVIATIONWEATHER_BASE_URL` | | AviationWeather.gov METAR API URL |
| `ICAO_AIRCRAFT_URL` | ✅ when `AIRCRAFT_SOURCES` includes `icao` | ICAO aircraft endpoint URL |
| `ICAO_WEATHER_URL` | ✅ when `WEATHER_SOURCE=icao` | ICAO weather endpoint URL |
| `ICAO_API_KEY` | | ICAO API bearer token |
| `CORS_ALLOWED_ORIGINS` | ✅ (production web) | Comma-separated frontend domains allowed by browser CORS |
| `REDIS_HOST` | | Redis hostname (default: `redis`) |
| `REDIS_PORT` | | Redis port (default: `6379`) |
| `REDIS_PASSWORD` | | Redis AUTH password |
| `ENVIRONMENT` | | `development` / `staging` / `production` |
| `API_PREFIX` | | API version prefix (default: `/api/v1`) |
| `ENABLE_LEGACY_UNPREFIXED_ROUTES` | | Also exposes routes without prefix (`/aircraft`, `/conflicts`, ...). Default: `true` |
| `OPENSKY_USERNAME` | | OpenSky Network username (optional, increases rate limits) |
| `OPENSKY_PASSWORD` | | OpenSky Network password |
| `LOG_LEVEL` | | `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `LOG_FORMAT` | | `json` (production) / `text` (development) |
| `WORKERS` | | Gunicorn worker count (default: `2*CPU+1`) |

See `.env.example` for full list.

Generate a password hash for production:
```bash
make auth-hash
```

Run launch preflight checks before public deployment:
```bash
make preflight
```

## API Endpoints

All endpoints (except `/health/*`, `/metrics`, `/docs`) require a Bearer JWT.

### Auth
```
POST /api/v1/auth/token        — Obtain JWT (configured via AUTH_USERNAME/AUTH_PASSWORD_HASH)
```

### Aircraft
```
GET  /api/v1/aircraft          — All tracked aircraft
```

### Weather
```
GET  /api/v1/weather           — Full weather grid
GET  /api/v1/weather/advisories — Per-aircraft weather warnings
```

### Snapshot
```
GET  /api/v1/snapshot          — Full airspace state (aircraft + weather + conflicts)
```

### Health & Metrics
```
GET  /health/live              — Liveness probe (always 200)
GET  /health/ready             — Readiness probe (503 if degraded)
GET  /metrics                  — Prometheus metrics
```

## Running Tests

```bash
# All tests
make test

# With coverage
make test-cov

# Individual test file
pytest tests/unit/test_conflict_engine.py -v
```

## CI/CD

The GitHub Actions pipeline (`.github/workflows/ci.yml`) runs on every push:

1. **Lint** — ruff check + format
2. **Type check** — mypy
3. **Test** — pytest with coverage report
4. **Docker build** — builds and smoke-tests the container

## Circuit Breakers

Both `opensky` and `openweather` ingestion clients are protected by independent circuit breakers.
Current state is visible at `GET /health/ready`.

| Circuit | Default threshold | Recovery timeout |
|---|---|---|
| OpenSky | 5 failures | 60 seconds |
| ADSB.lol | 5 failures | 60 seconds |
| ICAO aircraft | 5 failures | 60 seconds |
| OpenWeather | 5 failures | 120 seconds |
| AviationWeather.gov | 5 failures | 120 seconds |
| ICAO weather | 5 failures | 60 seconds |
