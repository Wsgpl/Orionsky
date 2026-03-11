# Deploy To Render (Backend + Frontend)

This repo is not pre-deployed. Use this runbook to deploy it on Render.

## 1) Push Repo To GitHub

Render deploys from GitHub, so first push your latest code.

Before deploying, prepare env files from templates:

- Backend: `Backend/flight_radar/.env.production.example`
- Frontend: `Frontend/.env.production.example`

## 2) Create Redis On Render

1. Render Dashboard -> New -> Redis
2. Name: `flightradar-redis`
3. Plan: choose Free/Starter as needed
4. After creation, copy:
   - `REDIS_HOST`
   - `REDIS_PORT`
   - `REDIS_PASSWORD`

## 3) Deploy Backend Service

1. Render Dashboard -> New -> Web Service
2. Select your repo
3. Configure:
   - Root Directory: `Backend/flight_radar`
   - Runtime: `Docker`
   - Dockerfile Path: `Backend/flight_radar/Dockerfile`
   - Health Check Path: `/health/ready`

4. Add environment variables:
   - `ENVIRONMENT=production`
   - `LOG_FORMAT=json`
   - `AIRCRAFT_SOURCES=opensky,adsblol` (or include `icao` if configured)
   - `WEATHER_SOURCE=aviationweather` (or `openweather` / `icao`)
   - `SECRET_KEY=<64+ char random string>`
   - `AUTH_USERNAME=admin`
   - `AUTH_PASSWORD_HASH=<bcrypt hash>`
   - `ENABLE_LEGACY_UNPREFIXED_ROUTES=false`
   - `REQUIRE_API_KEY=true`
   - `API_KEYS=public:<random_32+>,partner:<random_32+>`
   - `OPENWEATHER_API_KEY=<required if WEATHER_SOURCE=openweather>`
   - `ICAO_WEATHER_URL=<required if WEATHER_SOURCE=icao>`
   - `ICAO_AIRCRAFT_URL=<required if AIRCRAFT_SOURCES includes icao>`
   - `ICAO_API_KEY=<optional ICAO bearer token>`
   - `CORS_ALLOWED_ORIGINS=https://<your-frontend-domain>`
   - `REDIS_HOST=<from redis service>`
   - `REDIS_PORT=<from redis service>`
   - `REDIS_PASSWORD=<from redis service>`

5. Deploy and wait until health checks pass.

### Preflight Check (Recommended Before Render Deploy)

Run locally in `Backend/flight_radar`:

```bash
make preflight
```

This validates production-critical settings like API key enforcement, CORS, docs exposure, and required auth fields.

## 4) Deploy Frontend Static Site

1. Render Dashboard -> New -> Static Site
2. Select your repo
3. Configure:
   - Root Directory: `Frontend`
   - Build Command: `npm ci && npm run build`
   - Publish Directory: `dist`

4. Add environment variables:
   - `VITE_API_BASE_URL=https://<your-backend-service>.onrender.com`
   - `VITE_WS_URL=wss://<your-backend-service>.onrender.com`
   - `VITE_API_KEY=<issued public api key>`

5. Add rewrite rule for SPA:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: `Rewrite`

6. Deploy frontend.

## 5) Final Backend CORS Update

After frontend URL is known, ensure backend `CORS_ALLOWED_ORIGINS` matches it exactly, then redeploy backend.

## 6) Smoke Test

1. Open frontend URL.
2. Check backend health:
   - `https://<your-backend-service>.onrender.com/health/ready`
3. Verify API data:
   - `https://<your-backend-service>.onrender.com/api/v1/aircraft`

## Generate AUTH_PASSWORD_HASH

Run locally in `Backend/flight_radar`:

```bash
make auth-hash
```
