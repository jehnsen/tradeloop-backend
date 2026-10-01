# Tradeloop Backend

Multi-tenant logistics operations + trucking marketplace API (NestJS 11, PostgreSQL/PostGIS, Redis, BullMQ, Socket.IO).

## Architecture

Modular monolith deployed as two processes from one codebase:

- **API** (`src/main.ts`): REST under `/api/v1`, Socket.IO namespace `/realtime`, health under `/health`.
- **Worker** (`src/worker.ts`): BullMQ consumers (`matching`, `notifications`, `maintenance`) and repeatable maintenance jobs.

Domain modules live in `src/<module>` (auth, organizations, users, customers, locations, vehicles, drivers, orders, shipments, loads, trips, marketplace, matching, tracking, notifications, billing, documents, audit). Modules communicate through services and in-process domain events (`src/common/events`); async work is queued in Redis.

Key rules:

- Tenant scope comes from the authenticated membership (`organizationId` in the access token, verified against the DB on every request). Client-supplied `organizationId` is rejected. Foreign tenant IDs return `404`.
- Workflow state changes only through action endpoints (`/trips/:id/dispatch`, `/marketplace/offers/:id/accept`, ...).
- Offer acceptance, booking, capacity allocation and cancellation run in PostgreSQL transactions with row locks; partial unique indexes back them up.
- Marketplace responses are built by explicit view mappers (`src/marketplace/marketplace.views.ts`); entities are never serialized to other tenants.
- Matching is deterministic (PostGIS candidate search + `HeuristicMatchScorer`) behind the `MatchScorer` abstraction.
- Live GPS positions are kept in Redis; history is persisted to PostgreSQL only past distance/time thresholds.

## Prerequisites

- Node.js 22+ (24 LTS recommended), npm
- Docker + Docker Compose

`postgis/postgis` publishes amd64 images only; on Apple Silicon Compose runs it under emulation (`POSTGIS_PLATFORM` overrides).

## Local development

```bash
cp .env.example .env              # then set JWT_ACCESS_SECRET (openssl rand -hex 32)
docker compose up -d              # postgres (host 5433) + redis (host 6380)
npm install
npm run migration:run
npm run seed                      # development data, see credentials below
npm run start:dev                 # API on http://localhost:3000
npm run start:worker:dev          # worker (separate terminal)
```

API docs (Swagger): http://localhost:3000/api/docs (disable with `SWAGGER_ENABLED=false`).

## Full stack in Docker

```bash
JWT_ACCESS_SECRET=$(openssl rand -hex 32) docker compose --profile app up -d --build
docker compose --profile app run --rm -e NODE_ENV=development migrate npm run seed:prod   # optional demo data
```

The `migrate` service runs migrations before `api` and `worker` start. Uploaded files are stored in the `uploads` volume.

## Database

```bash
npm run migration:run                                        # apply
npm run migration:revert                                     # roll back last
npm run migration:generate -- src/database/migrations/Name   # generate from entity changes
```

`synchronize` is always off; the schema is managed only by migrations (`src/database/migrations`). The initial migration enables `postgis` and `pgcrypto`, creates GiST indexes on all geography columns and makes `audit_logs` append-only via trigger.

## Seed data (development only)

`npm run seed` is idempotent and refuses to run when `NODE_ENV=production`. All accounts use `SEED_PASSWORD` (default `DevPassword123!`).

| Email | Role | Organization |
| --- | --- | --- |
| `admin@tradeloop.local` (`SEED_ADMIN_EMAIL`) | PLATFORM_ADMIN | Tradeloop Platform |
| `owner@luzonhaulers.local` | OWNER | Luzon Haulers Inc. (trucking) |
| `dispatch@luzonhaulers.local` | DISPATCHER | Luzon Haulers Inc. |
| `driver@luzonhaulers.local` | DRIVER | Luzon Haulers Inc. |
| `owner@visayasfreight.local` | OWNER | Visayas Freight Lines (trucking, 4% commission override) |
| `driver@visayasfreight.local` | DRIVER | Visayas Freight Lines |
| `owner@metrogoods.local` | OWNER | Metro Goods Trading (shipper) |
| `ops@metrogoods.local` | OPERATIONS_MANAGER | Metro Goods Trading |

Includes locations, vehicles, drivers, a confirmed order with shipment/loads, open trips and matching marketplace postings.

## Testing

```bash
npm test             # unit tests
docker compose up -d # e2e needs postgres + redis
npm run test:e2e     # rebuilds tradeloop_test from migrations, runs API + worker in-process
npm run lint && npm run typecheck && npm run build
```

E2E tests use `.env.test` (database `tradeloop_test`, Redis DB 1, created by `docker/postgres/init`).

## Environment variables

See `.env.example` for the full list with defaults. Must be configured per environment:

| Variable | Notes |
| --- | --- |
| `JWT_ACCESS_SECRET` | **Required**, 32+ random characters. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` | PostgreSQL 14+ with PostGIS. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Queues, live tracking, rate limits, socket fan-out. |
| `CORS_ORIGINS` | Comma-separated origins (`*` allows all). |
| `SWAGGER_ENABLED` | Set `false` in production unless docs are wanted. |
| `TRUST_PROXY` | `true` when behind a load balancer (client IPs for rate limiting/audit). |
| `PLATFORM_COMMISSION_TYPE`, `PLATFORM_COMMISSION_VALUE` | Default commission; per-carrier overrides via `PATCH /api/v1/admin/organizations/:id/commission`. |
| `STORAGE_LOCAL_PATH`, `UPLOAD_MAX_BYTES` | Document storage (local driver). |
| `MATCH_*`, `TRACKING_*` | Matching weights/radii and GPS persistence thresholds. |

## Realtime

Connect to `/realtime` with `io(url + '/realtime', { auth: { token: accessToken } })`. Clients join `organization:{id}` and `user:{id}` automatically; emit `trip.subscribe` with `{ tripId }` to join `trip:{id}` (trip owners and shippers with a booking on the trip). Events: `vehicle.location.updated`, `trip.status.updated`, `trip.eta.updated`, `notification.created`.
