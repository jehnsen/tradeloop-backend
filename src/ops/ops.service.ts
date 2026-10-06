import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { Role } from '../common/enums';
import { AppConfig } from '../common/config/configuration';
import { AppException, forbidden, notFound } from '../common/http/app.exception';
import { RealtimePublisher, Rooms } from '../common/realtime/realtime.module';
import {
  findShipperRequest,
  getListingViews,
  shipperRequestView,
  toShipperListing,
  type ListingView,
} from './domain/lib/backhaul-marketplace';
import { getTripMetricsMap } from './domain/lib/logistics';
import { getStockMap } from './domain/lib/selectors';
import { diffOpsData } from './domain/lib/ops-data';
import type {
  BackhaulListing,
  OpsCommandResponse,
  OpsData,
  OpsSnapshot,
  PublicBackhaulBoard,
  PublicStorefront,
  PublicTenantProfile,
  Role as AppRole,
  ShipperRequestInput,
  ShipperRequestView,
  TenantProfile,
} from './domain/types';
import { anchoredClock, realClock, type OpsClock } from './engine/clock';
import type { OpsCommandName } from './engine/commands';
import { OpsCommandError } from './engine/errors';
import { runCommand, withTenant, type CommandArgs, type CommandResult } from './engine/run';
import { APP_ROLE } from './ops-roles';
import { OpsStore, type TenantState } from './persistence/ops-store';
import { projectData, projectProfile } from './projection';
import { buildDemoTenant } from './seed';

/** Who is running a command, resolved from the membership. */
export interface OpsActor {
  organizationId: string;
  userId: string | null;
  role: Role;
  appRole: AppRole;
  /** Name written into history entries. */
  name: string;
  /** DRV-… for drivers, CUS-… for customers. */
  subjectRef: string | null;
  organization: { name: string; code: string; demo: boolean };
}

/** Extra check run against the current data before a command (e.g. a driver's own trip). */
export type OpsGuard = (data: OpsData, actor: OpsActor) => void;

const CACHE_LIMIT = 20;

/**
 * TradeLoop operations: serves each organization's data set and runs the workflow commands.
 *
 * Commands for one organization are serialized by a row lock on `ops.tenants`, run against the
 * cached data set (reloaded whenever another process changed the version) and written back as a
 * change set in the same transaction. Readers never block: they get the latest committed version.
 */
@Injectable()
export class OpsService {
  private readonly cache = new Map<string, TenantState>();
  private readonly clockAnchor: string | null;
  private readonly demoReset: boolean;

  constructor(
    private readonly dataSource: DataSource,
    private readonly store: OpsStore,
    private readonly audit: AuditService,
    private readonly realtime: RealtimePublisher,
    config: ConfigService<AppConfig, true>,
  ) {
    const ops = config.get('ops', { infer: true });
    this.clockAnchor = ops.clockAnchor;
    this.demoReset = ops.demoReset;
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────
  async snapshot(ctx: TenantContext): Promise<OpsSnapshot> {
    const actor = await this.actor(ctx);
    const state = await this.state(ctx.organizationId);
    return {
      viewer: {
        name: actor.name,
        role: actor.appRole,
        subjectRef: actor.subjectRef,
        canViewAs: actor.role === Role.OWNER || actor.role === Role.ADMIN,
        organization: actor.organization,
      },
      version: state.version,
      now: this.clockFor(state.tick).now(),
      profile: projectProfile(state.profile, actor.role, actor.subjectRef),
      data: projectData(state.data, actor.role, actor.subjectRef),
    };
  }

  async version(ctx: TenantContext): Promise<{ version: number; now: string }> {
    const row = await this.store.readTenant(this.dataSource.manager, ctx.organizationId);
    return row
      ? { version: row.version, now: this.clockFor(row.tick).now() }
      : { version: 0, now: this.clockFor(0).now() };
  }

  // ─── Commands ──────────────────────────────────────────────────────────────
  async execute<N extends OpsCommandName>(
    ctx: TenantContext,
    name: N,
    args: CommandArgs<N>,
    guard?: OpsGuard,
  ): Promise<OpsCommandResponse<CommandResult<N>>> {
    return this.run(await this.actor(ctx), name, args, guard);
  }

  private async run<N extends OpsCommandName>(
    actor: OpsActor,
    name: N,
    args: CommandArgs<N>,
    guard?: OpsGuard,
  ): Promise<OpsCommandResponse<CommandResult<N>>> {
    const orgId = actor.organizationId;
    await this.ensureTenant(orgId);
    const out = await this.dataSource.transaction(async (m) => {
      const row = (await this.store.readTenant(m, orgId, true))!;
      const cached = this.cache.get(orgId);
      const state = cached?.version === row.version ? cached : await this.store.load(m, orgId);
      guard?.(state.data, actor);
      const clock = this.clockFor(row.tick);
      let run: ReturnType<typeof runCommand<N>>;
      try {
        run = runCommand(
          state.data,
          { profile: state.profile, clock, actor: actor.name, role: actor.appRole },
          name,
          args,
        );
      } catch (e) {
        throw e instanceof OpsCommandError ? new AppException(e.status, e.code, e.message) : e;
      }
      const keys = await this.store.persist(m, orgId, run.changes, state.keys);
      const version = row.version + 1;
      await this.store.saveTenant(m, orgId, version, clock.tick);
      await this.audit.record(
        {
          action: `ops.${name}`,
          entityType: 'OpsCommand',
          entityId: resultId(run.result),
          organizationId: orgId,
          userId: actor.userId,
          metadata: {
            changed: Object.fromEntries(
              Object.entries(run.changes).map(([c, ch]) => [
                c,
                ch.upsert.length + ch.remove.length,
              ]),
            ),
          },
        },
        m,
      );
      const next: TenantState = {
        version,
        tick: clock.tick,
        profile: state.profile,
        data: run.data,
        keys,
      };
      return { before: state.data, next, result: run.result, now: clock.now() };
    });
    this.remember(orgId, out.next);
    this.realtime.emit(Rooms.organization(orgId), 'ops.changed', { version: out.next.version });
    const view = (d: OpsData) => projectData(d, actor.role, actor.subjectRef);
    return {
      result: out.result,
      changes: diffOpsData(view(out.before), view(out.next.data)),
      version: out.next.version,
      now: out.now,
    };
  }

  /** Put a demo organization back to the seeded snapshot (7:48 AM, Fri Sep 25, 2026). */
  async resetDemo(ctx: TenantContext): Promise<OpsSnapshot> {
    const [org] = await this.dataSource.query(`SELECT metadata FROM organizations WHERE id = $1`, [
      ctx.organizationId,
    ]);
    if (!this.demoReset || org?.metadata?.opsDemo !== true)
      throw forbidden('DEMO_RESET_DISABLED', 'Only demo organizations can be reset');
    await this.ensureTenant(ctx.organizationId);
    const next = await this.dataSource.transaction(async (m) => {
      const row = (await this.store.readTenant(m, ctx.organizationId, true))!;
      const demo = buildDemoTenant();
      return this.store.replaceAll(m, ctx.organizationId, demo.profile, demo.data, row.version + 1);
    });
    this.remember(ctx.organizationId, next);
    await this.audit.record({
      action: 'ops.demo_reset',
      entityType: 'Organization',
      entityId: ctx.organizationId,
    });
    this.realtime.emit(Rooms.organization(ctx.organizationId), 'ops.changed', {
      version: next.version,
    });
    return this.snapshot(ctx);
  }

  // ─── Public pages ──────────────────────────────────────────────────────────
  /** Storefront: contact details and product availability (no orders, customers or prices paid). */
  async publicStorefront(orgCode: string): Promise<PublicStorefront> {
    const state = await this.state(await this.organizationByCode(orgCode));
    return withTenant(state.profile, this.clockFor(state.tick).now(), () => ({
      profile: publicProfile(state.profile),
      stock: [
        ...getStockMap(state.data.inventory, state.data.orders, state.data.purchaseOrders).values(),
      ].map(({ value: _value, ...stock }) => ({ ...stock, value: 0 })),
    }));
  }

  async publicBoard(orgCode: string): Promise<PublicBackhaulBoard> {
    const state = await this.state(await this.organizationByCode(orgCode));
    return withTenant(state.profile, this.clockFor(state.tick).now(), () => ({
      profile: publicProfile(state.profile),
      listings: [...this.listingViews(state.data).values()]
        .filter((v): v is ListingView & { listing: BackhaulListing } => !!v.listing && v.accepting)
        .map(toShipperListing),
    }));
  }

  async publicRequest(
    orgCode: string,
    input: ShipperRequestInput,
  ): Promise<{ id: string; quotedFreight: number }> {
    const organizationId = await this.organizationByCode(orgCode);
    const res = await this.run(
      {
        organizationId,
        userId: null,
        role: Role.CUSTOMER,
        appRole: 'customer',
        name: `${input.shipper.contactName} (${input.shipper.businessName}, Return trips page)`,
        subjectRef: null,
        organization: { name: '', code: orgCode, demo: false },
      },
      'requestBackhaulSpace',
      [input],
    );
    const state = this.cache.get(organizationId)!;
    const request = state.data.backhaulRequests.find((r) => r.id === res.result)!;
    return { id: request.id, quotedFreight: request.quotedFreight };
  }

  async publicRequestStatus(
    orgCode: string,
    id: string,
    phone: string,
  ): Promise<ShipperRequestView> {
    const state = await this.state(await this.organizationByCode(orgCode));
    const request = findShipperRequest(state.data.backhaulRequests, id, phone);
    if (!request) throw notFound('Request');
    return withTenant(state.profile, this.clockFor(state.tick).now(), () => {
      const listing = state.data.backhaulListings.find((l) => l.id === request.listingId);
      const leg = listing ? this.listingViews(state.data).get(listing.tripId) : undefined;
      const job = request.jobId ? state.data.jobs.find((j) => j.id === request.jobId) : undefined;
      return shipperRequestView(request, job, leg);
    });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────
  private listingViews(d: OpsData) {
    const metrics = getTripMetricsMap(d.trips, d.jobs, d.loads, d.deliveries, d.expenses);
    return getListingViews(d.trips, d.backhaulListings, d.backhaulRequests, metrics, d.jobs);
  }

  private clockFor(tick: number): OpsClock {
    return this.clockAnchor ? anchoredClock(this.clockAnchor, tick) : realClock();
  }

  private async actor(ctx: TenantContext): Promise<OpsActor> {
    const [row] = await this.dataSource.query(
      `SELECT u.first_name, u.last_name, m.subject_ref, o.name AS org_name, o.code AS org_code,
              o.metadata AS org_metadata
         FROM organization_memberships m
         JOIN users u ON u.id = m.user_id
         JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = $1 AND m.organization_id = $2`,
      [ctx.userId, ctx.organizationId],
    );
    return {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      role: ctx.role,
      appRole: APP_ROLE[ctx.role],
      name: row ? `${row.first_name} ${row.last_name}`.trim() : 'TradeLoop',
      subjectRef: row?.subject_ref ?? null,
      organization: {
        name: row?.org_name ?? '',
        code: row?.org_code ?? '',
        demo: this.demoReset && row?.org_metadata?.opsDemo === true,
      },
    };
  }

  private async organizationByCode(code: string): Promise<string> {
    const [org] = await this.dataSource.query(
      `SELECT id FROM organizations WHERE upper(code) = upper($1) AND status = 'ACTIVE'`,
      [code],
    );
    if (!org) throw notFound('Organization');
    return org.id;
  }

  /** Latest committed data set, from the cache when nobody changed it since. */
  private async state(organizationId: string): Promise<TenantState> {
    await this.ensureTenant(organizationId);
    const row = (await this.store.readTenant(this.dataSource.manager, organizationId))!;
    const cached = this.cache.get(organizationId);
    if (cached?.version === row.version) return this.remember(organizationId, cached);
    const state = await this.dataSource.transaction('REPEATABLE READ', (m) =>
      this.store.load(m, organizationId),
    );
    return this.remember(organizationId, state);
  }

  /** New organizations start with an empty data set and their name as the business profile. */
  private async ensureTenant(organizationId: string) {
    if (this.cache.has(organizationId)) return;
    if (await this.store.readTenant(this.dataSource.manager, organizationId)) return;
    const [org] = await this.dataSource.query(
      `SELECT name, email, phone FROM organizations WHERE id = $1`,
      [organizationId],
    );
    if (!org) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Organization not found');
    await this.dataSource.transaction((m) =>
      this.store.createTenant(m, organizationId, emptyProfile(org.name, org.email, org.phone)),
    );
  }

  private remember(organizationId: string, state: TenantState) {
    this.cache.delete(organizationId);
    this.cache.set(organizationId, state);
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return state;
  }
}

function resultId(result: unknown): string | null {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'jobId' in result) return String(result.jobId);
  return null;
}

/** The business and its dispatch and sales desks, as the public pages show them. */
const publicProfile = (p: TenantProfile): PublicTenantProfile => ({
  company: p.company,
  staff: p.staff.filter((s) => s.role === 'dispatcher' || s.role === 'sales'),
});

function emptyProfile(name: string, email: string | null, phone: string | null): TenantProfile {
  return {
    company: {
      name,
      shortName: name,
      address: '',
      warehouse: '',
      phone: phone ?? '',
      mobile: phone ?? '',
      messenger: '',
      email: email ?? '',
      tin: '',
      businessHours: '',
      bankAccountMasked: '',
      gcashMasked: '',
    },
    staff: [],
    helpers: [],
    trucks: [],
    drivers: [],
    lifetimeBaseline: {},
    salesLifetimeBaseline: {},
  };
}
