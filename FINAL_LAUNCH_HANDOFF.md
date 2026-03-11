# Final Launch Handoff

This repository is now finalized for technical launch readiness.

## Completed In Code

- API key authentication and management endpoints
- Plan-based quotas and usage logging
- Production security headers middleware
- Production config hardening checks in backend settings
- Frontend auth refactor to env-based API key/JWT (no hardcoded admin password)
- Backend and frontend production env templates
- Deployment runbook updates
- Commercial launch checklist updates
- Automated backend preflight checker (`make preflight`)

## Run Before Deploy

1. Backend env:
   - Copy `Backend/flight_radar/.env.production.example` to `.env`
   - Fill all real production values
2. Frontend env:
   - Copy `Frontend/.env.production.example` to `.env`
   - Set real backend URLs and issued API key
3. Run checks:
   - `cd Backend/flight_radar`
   - `make preflight`

## Manual External Actions Still Required

1. Buy domain and configure DNS
2. Configure hosting + TLS certificates (custom domains)
3. Confirm commercial-use rights for all upstream data providers
4. Set up billing/payment provider for paid plans
5. Set up monitoring + alerting (uptime, latency, ingestion failures)
6. Set up backups and incident response process
7. Publish legal pages on your public domain:
   - `TERMS_OF_SERVICE.md`
   - `PRIVACY_POLICY.md`
   - `SAFETY_DISCLAIMER.md`

These items cannot be completed from code alone and must be done in external services/accounts.
