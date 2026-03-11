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
├── ingestion/      # External API clients: OpenSky/ADSB.lol/ICAO + Open-Meteo/Copernicus
├── cache/          # Redis abstraction layer
├── middleware/     # Request tracking, rate limiting, exception handling
└── workers/        # Async background ingestion loops
```

## Local setup

```bash
cp .env.example .env
```

Fill in the real secret values in `.env`, then start the stack:

```bash
docker-compose up --build
```

With the API running, call the aircraft endpoint with one of the configured API keys:

```bash
curl -H "X-API-Key: YOUR_PUBLIC_API_KEY_HERE_12345" http://localhost:8000/api/v1/aircraft
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

docker-compose up --build -d

# Check logs
docker-compose logs -f api

# Health check
curl http://localhost:8000/health/ready
```

The default compose stack is OneDrive-safe: it runs from the official `python:3.12.3-slim` image, bind-mounts the backend into the container, and installs Python dependencies into a named volume on first start. The first `up` can take a minute or two; later restarts reuse the cached virtualenv.

On Windows PowerShell, use:

```powershell
docker-compose up --build -d
docker-compose logs -f api
docker-compose down
```

If you want to build the real application image from `Dockerfile.local` while the repo is under OneDrive, use the Windows helper below so Docker builds from a normalized temp context outside OneDrive.

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
export GENERAL_WEATHER_PROVIDER=<openmeteo>
export AVIATION_WEATHER_PROVIDER=<awc>
export AIR_QUALITY_PROVIDER=<copernicus_cams>
export DISASTER_PROVIDER=<copernicus_cems>
export OPEN_METEO_FORECAST_URL=<optional override>
export OPEN_METEO_GEOCODING_URL=<optional override>
export REDIS_HOST=<your redis host>
export REDIS_PASSWORD=<your redis password>

# 4. Run
docker run -d \
  -e ENVIRONMENT=production \
  -e SECRET_KEY=$SECRET_KEY \
  -e AUTH_USERNAME=$AUTH_USERNAME \
  -e AUTH_PASSWORD_HASH=$AUTH_PASSWORD_HASH \
  -e CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS \
  -e GENERAL_WEATHER_PROVIDER=$GENERAL_WEATHER_PROVIDER \
  -e AVIATION_WEATHER_PROVIDER=$AVIATION_WEATHER_PROVIDER \
  -e AIR_QUALITY_PROVIDER=$AIR_QUALITY_PROVIDER \
  -e DISASTER_PROVIDER=$DISASTER_PROVIDER \
  -e OPEN_METEO_FORECAST_URL=$OPEN_METEO_FORECAST_URL \
  -e OPEN_METEO_GEOCODING_URL=$OPEN_METEO_GEOCODING_URL \
  -e REDIS_HOST=$REDIS_HOST \
  -e REDIS_PASSWORD=$REDIS_PASSWORD \
  -p 8000:8000 \
  --restart unless-stopped \
  flightradar-api:latest
```

Windows + OneDrive-safe image build:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/docker-build-local.ps1
```

Project notes and backend-specific design docs live in `docs/`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | ✅ | JWT signing secret (≥32 chars). Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `AUTH_USERNAME` | ✅ | Login username for `/api/v1/auth/token` |
| `AUTH_PASSWORD_HASH` | ✅ (production) | bcrypt hash for `AUTH_USERNAME` password. Generate via `make auth-hash` |
| `AIRCRAFT_SOURCES` | | Comma-separated aircraft feeds: `opensky,adsblol,icao` (default: `opensky`) |
| `GENERAL_WEATHER_PROVIDER` | | Active general weather provider: `openmeteo` |
| `AVIATION_WEATHER_PROVIDER` | | Aviation weather provider: `awc` |
| `AIR_QUALITY_PROVIDER` | | Air-quality provider: `copernicus_cams` |
| `DISASTER_PROVIDER` | | Disaster-context provider: `copernicus_cems` |
| `OPEN_METEO_FORECAST_URL` | | Optional Open-Meteo forecast endpoint override |
| `OPEN_METEO_GEOCODING_URL` | | Optional Open-Meteo geocoding endpoint override |
| `AWC_BASE_URL` | | NOAA AWC API base URL for METAR / TAF / SIGMET products |
| `ICAO_AIRCRAFT_URL` | ✅ when `AIRCRAFT_SOURCES` includes `icao` | ICAO aircraft endpoint URL |
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

Additional backend notes:
- `docs/DYNAMIC_CONFIG.md` - dynamic config model and seeding flow
- `docs/REFACTORING_SUMMARY.md` - backend refactor notes

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

Both `opensky` and `openmeteo` ingestion clients are protected by independent circuit breakers.
Current state is visible at `GET /health/ready`.

| Circuit | Default threshold | Recovery timeout |
|---|---|---|
| OpenSky | 5 failures | 60 seconds |
| ADSB.lol | 5 failures | 60 seconds |
| ICAO aircraft | 5 failures | 60 seconds |
| Open-Meteo | 5 failures | 120 seconds |
| AviationWeather.gov | 5 failures | 120 seconds |
| ICAO weather | 5 failures | 60 seconds |
