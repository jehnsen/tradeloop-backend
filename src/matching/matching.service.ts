import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import { TenantContext } from '../common/auth/auth-context';
import { AppConfig, MatchingConfig } from '../common/config/configuration';
import {
  DomainEventPublisher,
  DomainEvents,
  MatchFoundEvent,
  PostingEvent,
} from '../common/events/domain-events';
import { AvailableLoadPosting } from '../marketplace/entities/load-posting.entity';
import { PostingStatus } from '../marketplace/entities/marketplace.enums';
import { AvailableVehiclePosting } from '../marketplace/entities/vehicle-posting.entity';
import { loadPostingView, vehiclePostingView } from '../marketplace/marketplace.views';
import { notFound } from '../common/http/app.exception';
import { JobNames, QueueNames } from '../queue/queue.constants';
import { MatchGeometry, MatchScore, MatchScorer } from './match-scorer';

interface CandidateRow {
  candidate_id: string;
  o_p: number;
  p_q: number;
  q_d: number;
  o_d: number;
  p_d: number;
}

export interface MatchPair {
  loadPosting: AvailableLoadPosting;
  vehiclePosting: AvailableVehiclePosting;
  result: MatchScore;
}

const CANDIDATE_LIMIT = 200;

/** Mutual visibility between two postings' owners (the fixed side and the candidate side). */
const visibleSql = (posting: string, viewerOrgExpr: string) => `(
  ${posting}.visibility = 'NETWORK'
  OR (${posting}.visibility = 'PARTNERS_ONLY' AND EXISTS (
    SELECT 1 FROM organization_partnerships op
     WHERE op.organization_id = ${posting}.organization_id AND op.partner_organization_id = ${viewerOrgExpr})))`;

const activeSql = (alias: string) =>
  `${alias}.deleted_at IS NULL AND ${alias}.status IN ('OPEN', 'MATCHED') AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > now())`;

/**
 * Candidate retrieval uses PostGIS (GiST-indexed proximity plus a straight-line route corridor);
 * scoring is delegated to the injected MatchScorer.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly config: MatchingConfig;

  constructor(
    @InjectRepository(AvailableLoadPosting)
    private readonly loadPostings: Repository<AvailableLoadPosting>,
    @InjectRepository(AvailableVehiclePosting)
    private readonly vehiclePostings: Repository<AvailableVehiclePosting>,
    @InjectQueue(QueueNames.MATCHING) private readonly queue: Queue,
    private readonly dataSource: DataSource,
    private readonly scorer: MatchScorer,
    private readonly events: DomainEventPublisher,
    config: ConfigService<AppConfig, true>,
  ) {
    this.config = config.get('matching', { infer: true });
  }

  async trucksForLoad(ctx: TenantContext, loadPostingId: string, limit = 20) {
    const owned = await this.loadPostings.exists({
      where: { id: loadPostingId, organizationId: ctx.organizationId },
    });
    if (!owned) throw notFound('Load posting');
    const pairs = await this.matchLoadPosting(loadPostingId);
    return pairs.slice(0, limit).map((p) => ({
      ...this.summary(p.result),
      posting: vehiclePostingView(p.vehiclePosting, ctx.organizationId),
    }));
  }

  async loadsForTruck(ctx: TenantContext, vehiclePostingId: string, limit = 20) {
    const owned = await this.vehiclePostings.exists({
      where: { id: vehiclePostingId, organizationId: ctx.organizationId },
    });
    if (!owned) throw notFound('Vehicle posting');
    const pairs = await this.matchVehiclePosting(vehiclePostingId);
    return pairs.slice(0, limit).map((p) => ({
      ...this.summary(p.result),
      posting: loadPostingView(p.loadPosting, ctx.organizationId),
    }));
  }

  async matchLoadPosting(loadPostingId: string): Promise<MatchPair[]> {
    const rows = await this.candidates('load', loadPostingId);
    if (!rows.length) return [];
    const [loadPosting, vehicles] = await Promise.all([
      this.loadPostings.findOneOrFail({ where: { id: loadPostingId } }),
      this.vehiclePostings.find({
        where: { id: In(rows.map((r) => r.candidate_id)) },
        relations: { organization: true, originLocation: true, destinationLocation: true },
      }),
    ]);
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    return this.rank(rows, (row) => {
      const vehiclePosting = byId.get(row.candidate_id);
      return vehiclePosting && { loadPosting, vehiclePosting };
    });
  }

  async matchVehiclePosting(vehiclePostingId: string): Promise<MatchPair[]> {
    const rows = await this.candidates('vehicle', vehiclePostingId);
    if (!rows.length) return [];
    const [vehiclePosting, loads] = await Promise.all([
      this.vehiclePostings.findOneOrFail({ where: { id: vehiclePostingId } }),
      this.loadPostings.find({
        where: { id: In(rows.map((r) => r.candidate_id)) },
        relations: { organization: true, pickupLocation: true, deliveryLocation: true },
      }),
    ]);
    const byId = new Map(loads.map((l) => [l.id, l]));
    return this.rank(rows, (row) => {
      const loadPosting = byId.get(row.candidate_id);
      return loadPosting && { loadPosting, vehiclePosting };
    });
  }

  /** Recomputes and stores matches for a posting; newly discovered pairs raise match.found once. */
  async refresh(side: 'load' | 'vehicle', postingId: string): Promise<number> {
    const fixed =
      side === 'load'
        ? await this.loadPostings.findOne({ where: { id: postingId } })
        : await this.vehiclePostings.findOne({ where: { id: postingId } });
    if (!fixed || ![PostingStatus.OPEN, PostingStatus.MATCHED].includes(fixed.status)) return 0;

    const pairs =
      side === 'load'
        ? await this.matchLoadPosting(postingId)
        : await this.matchVehiclePosting(postingId);
    const found: MatchFoundEvent[] = [];
    await this.dataSource.transaction(async (manager) => {
      for (const { loadPosting, vehiclePosting, result } of pairs) {
        const rows: Array<{ inserted: boolean }> = await manager.query(
          `INSERT INTO marketplace_matches (load_posting_id, vehicle_posting_id, score, reasons, pickup_detour_km, dropoff_detour_km)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (load_posting_id, vehicle_posting_id) DO UPDATE
             SET score = EXCLUDED.score, reasons = EXCLUDED.reasons, pickup_detour_km = EXCLUDED.pickup_detour_km,
                 dropoff_detour_km = EXCLUDED.dropoff_detour_km, updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [
            loadPosting.id,
            vehiclePosting.id,
            result.score,
            JSON.stringify(result.reasons),
            result.estimatedPickupDetourKm,
            result.estimatedDropoffDetourKm,
          ],
        );
        if (rows[0]?.inserted) {
          found.push({
            loadPostingId: loadPosting.id,
            vehiclePostingId: vehiclePosting.id,
            loadOrganizationId: loadPosting.organizationId,
            vehicleOrganizationId: vehiclePosting.organizationId,
            score: result.score,
          });
        }
      }
      if (pairs.length) {
        const loadIds = [...new Set(pairs.map((p) => p.loadPosting.id))];
        const vehicleIds = [...new Set(pairs.map((p) => p.vehiclePosting.id))];
        await manager
          .getRepository(AvailableLoadPosting)
          .update(
            { id: In(loadIds), status: PostingStatus.OPEN },
            { status: PostingStatus.MATCHED },
          );
        await manager
          .getRepository(AvailableVehiclePosting)
          .update(
            { id: In(vehicleIds), status: PostingStatus.OPEN },
            { status: PostingStatus.MATCHED },
          );
      }
    });
    for (const event of found) await this.events.publish(DomainEvents.MATCH_FOUND, event);
    this.logger.log(
      { side, postingId, matches: pairs.length, new: found.length },
      'Matching refreshed',
    );
    return pairs.length;
  }

  @OnEvent(DomainEvents.MARKETPLACE_LOAD_CREATED)
  @OnEvent(DomainEvents.MARKETPLACE_LOAD_UPDATED)
  async onLoadPosting(event: PostingEvent): Promise<void> {
    await this.enqueue(JobNames.MATCH_LOAD_POSTING, event.postingId);
  }

  @OnEvent(DomainEvents.MARKETPLACE_VEHICLE_CREATED)
  @OnEvent(DomainEvents.MARKETPLACE_VEHICLE_UPDATED)
  async onVehiclePosting(event: PostingEvent): Promise<void> {
    await this.enqueue(JobNames.MATCH_VEHICLE_POSTING, event.postingId);
  }

  private async enqueue(name: string, postingId: string): Promise<void> {
    // Unique per event; the job itself is idempotent (upsert), so retries and duplicates are harmless.
    await this.queue.add(name, { postingId }, { jobId: `${name}-${postingId}-${Date.now()}` });
  }

  private rank(
    rows: CandidateRow[],
    resolve: (row: CandidateRow) => Omit<MatchPair, 'result'> | undefined,
  ): MatchPair[] {
    const pairs: MatchPair[] = [];
    for (const row of rows) {
      const pair = resolve(row);
      if (!pair) continue;
      const geo: MatchGeometry = {
        originToPickupKm: Number(row.o_p),
        pickupToDropoffKm: Number(row.p_q),
        dropoffToDestinationKm: Number(row.q_d),
        originToDestinationKm: Number(row.o_d),
        pickupToDestinationKm: Number(row.p_d),
      };
      const result = this.scorer.score(pair.loadPosting, pair.vehiclePosting, geo);
      if (result.eligible && result.score >= this.config.minScore) pairs.push({ ...pair, result });
    }
    return pairs.sort((a, b) => b.result.score - a.result.score);
  }

  private summary(result: MatchScore) {
    return {
      score: result.score,
      reasons: result.reasons,
      estimatedPickupDetourKm: result.estimatedPickupDetourKm,
      estimatedDropoffDetourKm: result.estimatedDropoffDetourKm,
    };
  }

  /**
   * Geographic pre-filter: pickup near the truck origin or within the corridor of its straight-line
   * route, and likewise for dropoff vs destination. Hard constraints (capacity, vehicle type,
   * schedule tolerance, mutual visibility, different organizations) are applied in SQL.
   */
  private candidates(fixed: 'load' | 'vehicle', postingId: string): Promise<CandidateRow[]> {
    const line = `ST_MakeLine(v.origin_point::geometry, v.destination_point::geometry)::geography`;
    const candidate = fixed === 'load' ? 'v' : 'lp';
    return this.dataSource.query(
      `SELECT ${candidate}.id AS candidate_id,
              ST_Distance(v.origin_point, lp.pickup_point) / 1000 AS o_p,
              ST_Distance(lp.pickup_point, lp.delivery_point) / 1000 AS p_q,
              ST_Distance(lp.delivery_point, v.destination_point) / 1000 AS q_d,
              ST_Distance(v.origin_point, v.destination_point) / 1000 AS o_d,
              ST_Distance(lp.pickup_point, v.destination_point) / 1000 AS p_d
         FROM load_postings lp
         JOIN vehicle_postings v ON v.organization_id <> lp.organization_id
        WHERE ${fixed === 'load' ? 'lp' : 'v'}.id = $1
          AND ${activeSql(candidate)}
          AND v.available_weight_kg >= lp.weight_kg
          AND (lp.volume_m3 IS NULL OR v.available_volume_m3 IS NULL OR v.available_volume_m3 >= lp.volume_m3)
          AND (lp.required_vehicle_type IS NULL OR lp.required_vehicle_type = v.vehicle_type)
          AND v.departure_until >= lp.pickup_from - make_interval(hours => $2)
          AND v.departure_from <= lp.pickup_until + make_interval(hours => $2)
          AND (ST_DWithin(v.origin_point, lp.pickup_point, $3) OR ST_DWithin(lp.pickup_point, ${line}, $4))
          AND (ST_DWithin(v.destination_point, lp.delivery_point, $3) OR ST_DWithin(lp.delivery_point, ${line}, $4))
          AND ${visibleSql('v', 'lp.organization_id')}
          AND ${visibleSql('lp', 'v.organization_id')}
        LIMIT ${CANDIDATE_LIMIT}`,
      [
        postingId,
        Math.ceil(this.config.scheduleToleranceHours),
        this.config.proximityRadiusKm * 1000,
        this.config.corridorKm * 1000,
      ],
    );
  }
}
