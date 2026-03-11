# AeroIntel Frontend

React + TypeScript frontend for the FlightRadar backend.

## Prerequisites

- Node.js 18+
- Backend running
- Mapbox public token

## Setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Edit `.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_MAPBOX_TOKEN=pk.your_mapbox_public_token

# Recommended for public/commercial frontend
VITE_API_KEY=replace-with-issued-api-key

# Optional: only for private/admin dashboard use
# VITE_AUTH_USERNAME=admin
# VITE_AUTH_PASSWORD=replace-with-strong-password
```

3. Install and run:

```bash
npm install
npm run dev
```

App URL: `http://localhost:3000`

## Production build

```bash
# optionally start from production template:
# cp .env.production.example .env
npm run build
npm run preview
```

## Security note

Do not ship admin credentials in frontend env files. For public clients, use `VITE_API_KEY` with plan-based limits and rotate keys regularly.
