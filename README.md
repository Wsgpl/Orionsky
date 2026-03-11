# Flight Radar & Weather Dashboard

Real-time flight tracking, weather intelligence, and route-planning dashboard focused on the India region.

This repository contains:
- a FastAPI backend that ingests aircraft and weather data, stores live state in Redis, and exposes API endpoints
- a React + Vite frontend that renders radar, weather, planning, and auth flows on top of interactive maps

## What the project does

The platform combines multiple data domains into one operational dashboard:
- live aircraft radar and flight state
- general weather layers and forecast views
- aviation weather signals such as METAR, TAF, and SIGMET-derived risk
- air-quality and disaster-context overlays
- route and mission planning with risk scoring
- API-key and auth-protected backend access

## Architecture

At a high level:

```text
Frontend (React + Vite)
        |
        v
Backend API (FastAPI)
        |
        +--> Redis cache / state store
        +--> Aircraft ingestion workers
        +--> Weather ingestion workers
        +--> Risk / forecast / mission services
```

Important backend runtime note:
- the backend starts background ingestion loops inside the app process
- because of that, `WORKERS` must stay `1` unless ingestion is moved into separate services

## Tech stack

### Backend
- Python 3.12
- FastAPI
- Gunicorn + Uvicorn worker
- Redis
- Pydantic
- Pytest
- Ruff and mypy

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- Zustand
- Leaflet / React Leaflet
- Framer Motion

## Repository structure

```text
Flight_Radar_and_weather_dashboard/
|-- Backend/
|   |-- .venv/                     # Local backend virtualenv if created
|   `-- flight_radar/
|       |-- app/                   # Backend application code
|       |   |-- api/v1/            # API route handlers
|       |   |-- cache/             # Redis wrapper
|       |   |-- core/              # Settings, auth, dependencies, logging
|       |   |-- engines/           # Pure logic / scoring engines
|       |   |-- ingestion/         # Provider clients and ingestion adapters
|       |   |-- middleware/        # HTTP middleware
|       |   |-- models/            # Internal config models
|       |   |-- repositories/      # Config persistence layer
|       |   |-- schemas/           # Pydantic request/response models
|       |   |-- services/          # Business orchestration layer
|       |   |-- utils/             # Shared helpers
|       |   `-- workers/           # Background ingestion loops
|       |-- docs/                  # Backend notes and design docs
|       |-- scripts/               # Local build / preflight / seeding helpers
|       |-- tests/                 # Unit and integration tests
|       |-- docker-compose.yml     # Backend + Redis local stack
|       |-- Dockerfile
|       |-- Dockerfile.local
|       |-- gunicorn.conf.py
|       |-- pyproject.toml
|       |-- pytest.ini
|       |-- requirements.txt
|       `-- README.md              # Backend-specific documentation
|-- Frontend/
|   |-- public/
|   |-- src/
|   |   |-- components/            # Shared UI and map components
|   |   |-- config/                # Runtime config helpers
|   |   |-- hooks/                 # Data-fetch and UI hooks
|   |   |-- pages/                 # Radar, weather, planning, auth screens
|   |   |-- services/              # Frontend API client
|   |   |-- store/                 # Zustand state store
|   |   |-- styles/                # Global styles
|   |   |-- types/                 # Type definitions
|   |   `-- utils/                 # Frontend utilities and datasets
|   |-- package.json
|   `-- .env.example
|-- archive/                       # Old notes / archived docs
`-- .gitignore
```

## Main product areas

### Frontend routes
- `/radar` for aircraft radar
- `/weather` for weather visualization
- `/planning` for route planning and analysis
- `/auth` for login and registration
- `/verify-email` for email verification
- `/guide` for the in-app user guide

### Backend API groups
- `/api/v1/aircraft`
- `/api/v1/weather`
- `/api/v1/forecast`
- `/api/v1/aviation`
- `/api/v1/air-quality`
- `/api/v1/disaster`
- `/api/v1/route-risk`
- `/api/v1/missions`
- `/api/v1/mission-export`
- `/api/v1/config`
- `/api/v1/auth`
- `/api/v1/api-keys`
- `/api/v1/snapshot`
- `/health/live`
- `/health/ready`
- `/metrics`

## Data sources and integrations

The backend is designed around provider-based ingestion. Current integrations in the codebase include:
- Spire AirSafe for aircraft data
- OpenSky as optional aircraft fallback
- ADSB.lol and ADSB Exchange adapters
- Open-Meteo for general weather and forecast
- NOAA Aviation Weather Center for aviation weather products
- Copernicus CAMS for air quality
- Copernicus CEMS for disaster context

## Quick start

### Prerequisites

- Docker Desktop
- Node.js 18+ and npm
- Python 3.12 if you want to run backend tooling outside Docker

### 1. Backend setup

From the backend folder:

```bash
cd Backend/flight_radar
cp .env.example .env
```

Fill in the real values in `.env`.

Minimum useful backend values:
- `SECRET_KEY`
- `SPIRE_API_TOKEN`
- `API_KEYS`

Then start the backend and Redis:

```bash
docker-compose up --build
```

The backend will be available at:
- `http://localhost:8000`
- docs in non-production environments at `http://localhost:8000/docs`

### 2. Frontend setup

From the frontend folder:

```bash
cd Frontend
cp .env.example .env
npm install
npm run dev
```

The frontend development server will start on Vite's local port, typically:
- `http://localhost:5173`

## Environment files

Never commit real `.env` files. Use the example files as templates:
- `Backend/flight_radar/.env.example`
- `Frontend/.env.example`

### Backend environment notes

Important backend variables:
- `SECRET_KEY` for JWT signing
- `ENVIRONMENT` such as `development` or `production`
- `WORKERS=1`
- `REDIS_HOST`
- `SPIRE_API_TOKEN`
- `AIRCRAFT_SOURCES`
- `GENERAL_WEATHER_PROVIDER`
- `AVIATION_WEATHER_PROVIDER`
- `AIR_QUALITY_PROVIDER`
- `DISASTER_PROVIDER`
- `API_KEYS`
- `REQUIRE_API_KEY`

### Frontend environment notes

Important frontend variables:
- `VITE_API_BASE_URL`
- `VITE_API_KEY`
- `VITE_AUTH_USERNAME` and `VITE_AUTH_PASSWORD` for private/admin flows
- map center / tile / animation configuration values

## Running the project

### Recommended local workflow

1. Start the backend stack with Docker Compose from `Backend/flight_radar`
2. Start the frontend dev server from `Frontend`
3. Open the frontend in your browser
4. Verify backend health and API access before deeper testing

## API usage

Base API URL:

```text
http://localhost:8000/api/v1
```

Most application endpoints require an API key and/or auth token depending on the route and backend configuration.

### Example request with API key

```bash
curl http://localhost:8000/api/v1/aircraft \
  -H "X-API-Key: your-key-here"
```

### Health checks

```bash
curl http://localhost:8000/health/live
curl http://localhost:8000/health/ready
```

## Development workflow

### Backend

Useful commands from `Backend/flight_radar`:

```bash
make dev
make test
make test-cov
make lint
make typecheck
make preflight
```

Dockerized backend test run:

```bash
docker-compose exec -T api /opt/venv/bin/pytest tests/ -q
```

### Frontend

Useful commands from `Frontend`:

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Backend design notes

The backend follows a layered structure:
- `api/v1` keeps handlers thin
- `services` orchestrates use cases
- `engines` contains reusable risk/scoring logic
- `ingestion` handles external providers
- `workers` refresh live data in the background
- Redis acts as both cache and operational state store

## Troubleshooting

### Backend starts but no aircraft appear
- check `SPIRE_API_TOKEN`
- confirm the provider returned data successfully
- inspect backend logs from the `api` container

### Backend fails with worker issues
- verify `WORKERS=1`
- do not scale Gunicorn workers without separating ingestion workers

### Frontend cannot reach the API
- verify `VITE_API_BASE_URL`
- check that backend is reachable on `localhost:8000`
- confirm CORS and API-key settings

### Redis problems
- verify the `redis` container is healthy in `docker-compose`
- confirm `REDIS_HOST=redis` when using the provided compose stack

## Additional documentation

More backend-specific notes live in:
- `Backend/flight_radar/README.md`
- `Backend/flight_radar/docs/DYNAMIC_CONFIG.md`
- `Backend/flight_radar/docs/REFACTORING_SUMMARY.md`

## Current status

This repository contains both active application code and some archived project material under `archive/`. For day-to-day development, focus on:
- `Backend/flight_radar`
- `Frontend`
