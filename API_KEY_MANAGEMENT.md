# API Key Management and Plans

The backend now supports:

1. API key lifecycle: create, list, rotate, revoke
2. Per-key quota plans (`free`, `pro`, `enterprise`, or custom)
3. Daily usage logging for billing/reporting

## Authentication

- Management endpoints require admin JWT (`AUTH_USERNAME` token).
- Protected data endpoints accept:
  - `Authorization: Bearer <jwt>`
  - `X-API-Key: <api-key>`
  - `Authorization: ApiKey <api-key>`

## Environment Variables

- `REQUIRE_API_KEY=true|false`
- `API_KEYS=name:key,name2:key2`
- `DEFAULT_API_PLAN=free`
- `API_KEY_PLANS=name:plan,name2:plan2`
- `PLAN_REQUEST_LIMITS=free:60,pro:300,enterprise:1200`
- `RATE_LIMIT_WINDOW_SECONDS=60`
- `ENABLE_API_USAGE_LOGGING=true`
- `API_USAGE_LOG_RETENTION_DAYS=90`

## Endpoints

Base path: `/api/v1/api-keys`

- `POST /api/v1/api-keys`
  - Create or replace key
  - Body: `{ "name": "customerA", "plan": "pro" }`

- `GET /api/v1/api-keys`
  - List keys (static + Redis managed)

- `POST /api/v1/api-keys/{name}/rotate`
  - Rotate key and return new secret
  - Body: `{ "plan": "enterprise" }` (optional)

- `POST /api/v1/api-keys/{name}/revoke`
  - Revoke key

- `GET /api/v1/api-keys/{name}/usage?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
  - Daily usage report by endpoint + status groups

## Billing Integration Hint

Use `GET /api/v1/api-keys/{name}/usage` to export monthly totals and map to plan pricing.

