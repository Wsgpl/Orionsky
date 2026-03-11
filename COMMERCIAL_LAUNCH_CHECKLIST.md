# Commercial Launch Checklist

This file tracks what is implemented in code now and what still needs external setup.

## Implemented In Code

- API key authentication support (`X-API-Key` or `Authorization: ApiKey <key>`)
- Config flag to require API key for protected endpoints: `REQUIRE_API_KEY`
- Config for multiple named keys: `API_KEYS=name:key,name2:key2`
- Security headers middleware:
  - `Content-Security-Policy`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Strict-Transport-Security` (production)
- Config flag for production docs exposure: `EXPOSE_DOCS_IN_PRODUCTION`
- Rate limiting prefers API key identity when present

## Required External Setup

- Buy and configure domain + TLS certificate
- Provider licensing review for all data feeds (commercial rights)
- Billing integration (Stripe or equivalent)
- Public legal pages deployment
- Monitoring/alerting (uptime, errors, API latency, ingestion failures)
- Backup and incident response process

## Backend Environment Variables (Commercial)

- `ENVIRONMENT=production`
- `SECRET_KEY=<64+ chars>`
- `AUTH_USERNAME=<admin>`
- `AUTH_PASSWORD_HASH=<bcrypt hash>`
- `REQUIRE_API_KEY=true`
- `API_KEYS=public:<random_32+>,partner:<random_32+>`
- `CORS_ALLOWED_ORIGINS=https://<your-frontend-domain>`
- `EXPOSE_DOCS_IN_PRODUCTION=false`
- `ENABLE_LEGACY_UNPREFIXED_ROUTES=false`
- Validate with `make preflight` before deploying

## Frontend Environment (Commercial)

- `VITE_API_BASE_URL=https://<your-backend-domain>`
- `VITE_WS_URL=wss://<your-backend-domain>`
- `VITE_API_KEY=<issued public key>`
- Do not set `VITE_AUTH_USERNAME` or `VITE_AUTH_PASSWORD` in public frontend builds

## Templates Added

- `Backend/flight_radar/.env.production.example`
- `Frontend/.env.production.example`
