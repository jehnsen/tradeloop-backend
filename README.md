# Tradeloop Backend

Multi-tenant logistics operations + trucking marketplace API (NestJS 11, PostgreSQL/PostGIS, Redis, BullMQ, Socket.IO).

## Architecture

Modular monolith deployed as two processes from one codebase:

- **API** (`src/main.ts`): REST under `/api/v1`, Socket.IO namespace `/realtime`, health under `/health`.
- **Worker** (`src/worker.ts`): BullMQ consumers (`matching`, `notifications`, `maintenance`) and repeatable maintenance jobs.

Domain modules live in `src/<module>` (auth, organizations, users, customers, locations, vehicles, drivers, orders, shipments, loads, trips, marketplace, matching, tracking, notifications, billing, documents, audit, **ops**). Modules communicate through services and in-process domain events (`src/common/events`); async work is queued in Redis.

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
npm run start:dev                 # API on http://localhost:4000
npm run start:worker:dev          # worker (separate terminal)
```

API docs (Swagger): http://localhost:4000/api/docs (disable with `SWAGGER_ENABLED=false`).

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
| `owner@lucenafresh.local` | OWNER | Lucena Fresh Trading & Logistics (TradeLoop demo) |
| `dispatch@`, `sales@`, `accounting@`, `warehouse@`, `procurement@lucenafresh.local` | DISPATCHER, SALES, FINANCE, WAREHOUSE, PROCUREMENT | Lucena Fresh |
| `driver@lucenafresh.local`, `driver2@lucenafresh.local` | DRIVER (DRV-01 Joel Mendoza, DRV-02 Ramon Villanueva) | Lucena Fresh |
| `marco@seasidegrill.local` | CUSTOMER (CUS-022 Seaside Grill Bacoor) | Lucena Fresh |

Includes locations, vehicles, drivers, a confirmed order with shipment/loads, open trips and matching marketplace postings. Lucena Fresh (`LUCENA-FRESH`) gets the full TradeLoop operations data set (see below); each part of the seed is skipped when it already exists.

## TradeLoop operations (`/api/v1/ops`)

The `ops` module serves the TradeLoop app (`trade-route-frontend`): logistics jobs, loads, trips and stops, deliveries and POD, freight billing, trip expenses, fuel, maintenance, vehicle documents, the Load Board, the Backhaul Marketplace preview and the trading preview, for one organization at a time.

- **Storage:** Postgres schema `ops`, one table per record type keyed by organization + readable id (`JOB-260925-009`, `TRIP-260925-01`). `data` (jsonb) holds the record; key columns (status, customer, trip, job…) are extracted on write and carry deferred foreign keys, so records stay relationally consistent. `sort_key` keeps each list in the app's order. Trucks and drivers are rows too; the business profile (company, staff, helpers, revenue baselines) is in `ops.tenants`.
- **Reads:** `GET /ops/snapshot` returns the organization's whole data set, the tenant profile, the viewer and the version (a few MB, compressed ~10×). `GET /ops/version` is the cheap poll target.
- **Commands:** every write is a workflow endpoint (`POST /ops/jobs`, `/ops/jobs/:id/assign`, `/ops/trips/:id/status`, `/ops/deliveries/:id/deliver`, `/ops/board/loads/:id/book`, …; see Swagger "Operations"). Commands for an organization are serialized by a row lock on `ops.tenants`, run against the cached data set (`src/ops/engine/commands.ts`), and the change set is written back in the same transaction and returned (`{ result, changes, version, now }`). Rule violations return `409` with a code (`TRIP_NOT_EDITABLE`, `NOT_ENOUGH_SPACE`, …). Every command is audited (`ops.<command>`).
- **Roles:** `src/ops/ops-roles.ts` maps membership roles to the app's desks and to who may run what. Drivers act only on their own trips and never receive money records; customers only see and order for their own account (`subjectRef` on the membership: `DRV-…` / `CUS-…`).
- **Public pages:** `GET /public/ops/:orgCode` (storefront availability), `GET /public/ops/:orgCode/return-trips`, `POST …/return-trips/requests`, `GET …/return-trips/requests/:id?phone=`. Shipper views never include trip ids, plates, drivers or exact truck times.
- **Clock:** `OPS_CLOCK_ANCHOR` (development: `2026-09-25T07:48`, the seed's "now") freezes "today" and advances two minutes per recorded event; unset it for real Manila time.
- **Demo reset:** with `OPS_DEMO_RESET=true`, owners of organizations whose metadata has `opsDemo: true` can `POST /ops/demo/reset`.
- **Shared domain:** `src/ops/domain` is generated from the app repo (types, reference data and the pure rules: stop planning, trip metrics, billing, Load Board matching, marketplace). Change those files in the app, then run `npm run domain:sync` (`npm run domain:check` fails when they differ; set `TRADELOOP_FRONTEND_DIR` if the app is not at `../../NextJS/trade-route-frontend`).

```bash
npm run check:seed    # demo data volumes, utilization, AR aging + relationship checks
npm run check:flows   # runs the ops commands end to end on the demo data (in memory) and asserts consistency
```

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
| `OPS_CLOCK_ANCHOR`, `OPS_DEMO_RESET` | TradeLoop operations clock and demo reset (see above). |
| `MATCH_*`, `TRACKING_*` | Matching weights/radii and GPS persistence thresholds. |

## Realtime

Connect to `/realtime` with `io(url + '/realtime', { auth: { token: accessToken } })`. Clients join `organization:{id}` and `user:{id}` automatically; emit `trip.subscribe` with `{ tripId }` to join `trip:{id}` (trip owners and shippers with a booking on the trip). Events: `vehicle.location.updated`, `trip.status.updated`, `trip.eta.updated`, `notification.created`.
