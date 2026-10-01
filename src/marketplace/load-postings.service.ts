import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { AppConfig } from '../common/config/configuration';
import { DomainEventPublisher, DomainEvents, PostingEvent } from '../common/events/domain-events';
import { toPoint } from '../common/geo/geo';
import { badRequest, conflict, invalidTransition, notFound } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { Load, LoadStatus } from '../loads/load.entity';
import { LocationsService } from '../locations/locations.service';
import { Shipment } from '../shipments/shipment.entity';
import {
  CreateLoadPostingDto,
  LoadPostingQueryDto,
  MinePostingQueryDto,
  UpdateLoadPostingDto,
} from './dto/posting.dto';
import { AvailableLoadPosting } from './entities/load-posting.entity';
import { MarketplaceOffer } from './entities/marketplace-offer.entity';
import { ACTIVE_POSTING_STATUSES, PostingStatus } from './entities/marketplace.enums';
import { loadPostingView } from './marketplace.views';
import { applyPlace, applyRadius, applyWindowOverlap } from './posting-query';
import { closePendingOffers } from './vehicle-postings.service';
import { whereNotExpired, whereVisibleTo } from './visibility';

const EDITABLE = [PostingStatus.DRAFT, ...ACTIVE_POSTING_STATUSES];
const SORTS = {
  pickupFrom: 'p.pickupFrom',
  createdAt: 'p.createdAt',
  weightKg: 'p.weightKg',
  budget: 'p.budget',
};

@Injectable()
export class LoadPostingsService {
  private readonly defaultCurrency: string;

  constructor(
    @InjectRepository(AvailableLoadPosting) private readonly repo: Repository<AvailableLoadPosting>,
    private readonly dataSource: DataSource,
    private readonly locations: LocationsService,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.defaultCurrency = config.get('billing', { infer: true }).defaultCurrency;
  }

  async create(ctx: TenantContext, dto: CreateLoadPostingDto) {
    const posting = await this.dataSource.transaction(async (manager) => {
      const load = dto.loadId
        ? await manager.getRepository(Load).findOne({
            where: { id: dto.loadId, organizationId: ctx.organizationId },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      if (dto.loadId && !load) throw notFound('Load');
      if (load) {
        if (load.status !== LoadStatus.PENDING)
          throw conflict('LOAD_NOT_POSTABLE', `Load is ${load.status}`);
        const alreadyPosted = await manager.getRepository(AvailableLoadPosting).exists({
          where: { loadId: load.id, status: In([...EDITABLE, PostingStatus.BOOKED]) },
        });
        if (alreadyPosted)
          throw conflict('LOAD_ALREADY_POSTED', 'Load already has an active marketplace posting');
      }
      const shipment = load?.shipmentId
        ? await manager.getRepository(Shipment).findOne({ where: { id: load.shipmentId } })
        : null;

      const pickupLocationId = dto.pickupLocationId ?? shipment?.pickupLocationId;
      const deliveryLocationId = dto.deliveryLocationId ?? shipment?.deliveryLocationId;
      const pickupFrom = dto.pickupFrom ?? shipment?.pickupWindowStart ?? undefined;
      const weightKg = load?.weightKg ?? dto.weightKg;
      if (!pickupLocationId || !deliveryLocationId)
        throw badRequest('ROUTE_REQUIRED', 'pickup and delivery locations are required');
      if (!pickupFrom) throw badRequest('SCHEDULE_REQUIRED', 'pickupFrom is required');
      if (!weightKg) throw badRequest('WEIGHT_REQUIRED', 'weightKg is required');
      const pickupUntil = dto.pickupUntil ?? shipment?.pickupWindowEnd ?? pickupFrom;
      if (pickupUntil < pickupFrom)
        throw badRequest('INVALID_WINDOW', 'pickupUntil must be after pickupFrom');

      const pickup = await this.locations.getAccessible(
        ctx.organizationId,
        pickupLocationId,
        manager,
      );
      const delivery = await this.locations.getAccessible(
        ctx.organizationId,
        deliveryLocationId,
        manager,
      );
      const repo = manager.getRepository(AvailableLoadPosting);
      return repo.save(
        repo.create({
          organizationId: ctx.organizationId,
          loadId: load?.id ?? null,
          pickupLocationId,
          deliveryLocationId,
          pickupPoint: toPoint(pickup.latitude, pickup.longitude),
          deliveryPoint: toPoint(delivery.latitude, delivery.longitude),
          pickupFrom,
          pickupUntil,
          weightKg,
          volumeM3: load?.volumeM3 ?? dto.volumeM3 ?? null,
          requiredVehicleType: load?.requiredVehicleType ?? dto.requiredVehicleType ?? null,
          budget: dto.budget ?? null,
          currency: dto.currency ?? this.defaultCurrency,
          visibility: dto.visibility,
          notes: dto.notes ?? null,
          expiresAt: dto.expiresAt ?? pickupUntil,
          status: dto.publish === false ? PostingStatus.DRAFT : PostingStatus.OPEN,
        }),
      );
    });
    await this.audit.record({
      action: 'marketplace.load_posted',
      entityType: 'LoadPosting',
      entityId: posting.id,
    });
    if (posting.status === PostingStatus.OPEN)
      await this.publishEvent(DomainEvents.MARKETPLACE_LOAD_CREATED, posting);
    return this.get(ctx, posting.id);
  }

  browse(ctx: TenantContext, query: LoadPostingQueryDto) {
    const qb = this.baseQuery();
    qb.andWhere('p.status IN (:...statuses)', {
      statuses: query.status ? [query.status] : ACTIVE_POSTING_STATUSES,
    });
    whereVisibleTo(qb, 'p', ctx.organizationId);
    whereNotExpired(qb, 'p');
    if (!query.includeOwn)
      qb.andWhere('p.organizationId <> :viewer', { viewer: ctx.organizationId });
    if (query.organizationId)
      qb.andWhere('p.organizationId = :ownerOrg', { ownerOrg: query.organizationId });
    if (query.vehicleType) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('p.requiredVehicleType IS NULL')
            .orWhere('p.requiredVehicleType = :vt', { vt: query.vehicleType }),
        ),
      );
    }
    if (query.maxWeightKg !== undefined)
      qb.andWhere('p.weightKg <= :maxW', { maxW: query.maxWeightKg });
    if (query.maxVolumeM3 !== undefined)
      qb.andWhere('(p.volumeM3 IS NULL OR p.volumeM3 <= :maxV)', { maxV: query.maxVolumeM3 });
    applyRadius(
      qb,
      'p.pickup_point',
      { lat: query.originLat, lng: query.originLng, radiusKm: query.originRadiusKm },
      'origin',
    );
    applyRadius(
      qb,
      'p.delivery_point',
      { lat: query.destinationLat, lng: query.destinationLng, radiusKm: query.destinationRadiusKm },
      'destination',
    );
    applyPlace(qb, 'pl', query.originCity, query.originProvince, 'origin');
    applyPlace(qb, 'dl', query.destinationCity, query.destinationProvince, 'destination');
    applyWindowOverlap(qb, 'p.pickupFrom', 'p.pickupUntil', query.dateFrom, query.dateTo);
    return paginate(
      qb,
      { ...query, order: query.sort ? query.order : 'ASC' },
      SORTS,
      'pickupFrom',
    ).then((page) => page.map((p) => loadPostingView(p, ctx.organizationId)));
  }

  mine(ctx: TenantContext, query: MinePostingQueryDto) {
    const qb = this.baseQuery().andWhere('p.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    return paginate(qb, query, SORTS, 'createdAt').then((page) =>
      page.map((p) => loadPostingView(p, ctx.organizationId)),
    );
  }

  async get(ctx: TenantContext, id: string) {
    return loadPostingView(await this.findVisible(ctx.organizationId, id), ctx.organizationId);
  }

  async findVisible(viewerOrganizationId: string, id: string): Promise<AvailableLoadPosting> {
    const qb = this.baseQuery().andWhere('p.id = :id', { id });
    whereVisibleTo(qb, 'p', viewerOrganizationId);
    qb.andWhere('(p.organizationId = :viewerOrgId OR p.status <> :draft)', {
      draft: PostingStatus.DRAFT,
    });
    const posting = await qb.getOne();
    if (!posting) throw notFound('Load posting');
    return posting;
  }

  async update(ctx: TenantContext, id: string, dto: UpdateLoadPostingDto) {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AvailableLoadPosting);
      const posting = await repo.findOne({
        where: { id, organizationId: ctx.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!posting) throw notFound('Load posting');
      if (!EDITABLE.includes(posting.status))
        throw invalidTransition('load posting', posting.status, 'edit');
      if (
        posting.loadId &&
        (dto.weightKg !== undefined ||
          dto.volumeM3 !== undefined ||
          dto.requiredVehicleType !== undefined)
      ) {
        throw badRequest(
          'LOAD_LINKED',
          'Cargo figures come from the linked load; edit the load instead',
        );
      }
      Object.assign(
        posting,
        Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
      );
      if (posting.pickupUntil < posting.pickupFrom)
        throw badRequest('INVALID_WINDOW', 'pickupUntil must be after pickupFrom');
      if (dto.pickupLocationId) {
        const l = await this.locations.getAccessible(
          ctx.organizationId,
          dto.pickupLocationId,
          manager,
        );
        posting.pickupPoint = toPoint(l.latitude, l.longitude);
      }
      if (dto.deliveryLocationId) {
        const l = await this.locations.getAccessible(
          ctx.organizationId,
          dto.deliveryLocationId,
          manager,
        );
        posting.deliveryPoint = toPoint(l.latitude, l.longitude);
      }
      return repo.save(posting);
    });
    await this.audit.record({
      action: 'marketplace.load_updated',
      entityType: 'LoadPosting',
      entityId: id,
      metadata: { changes: Object.keys(dto) },
    });
    if (ACTIVE_POSTING_STATUSES.includes(saved.status))
      await this.publishEvent(DomainEvents.MARKETPLACE_LOAD_UPDATED, saved);
    return this.get(ctx, id);
  }

  async publish(ctx: TenantContext, id: string) {
    const posting = await this.repo.findOne({ where: { id, organizationId: ctx.organizationId } });
    if (!posting) throw notFound('Load posting');
    if (posting.status !== PostingStatus.DRAFT)
      throw invalidTransition('load posting', posting.status, 'publish');
    await this.repo.update({ id }, { status: PostingStatus.OPEN });
    await this.audit.record({
      action: 'marketplace.load_published',
      entityType: 'LoadPosting',
      entityId: id,
    });
    await this.publishEvent(DomainEvents.MARKETPLACE_LOAD_CREATED, posting);
    return this.get(ctx, id);
  }

  async cancel(ctx: TenantContext, id: string) {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AvailableLoadPosting);
      const posting = await repo.findOne({
        where: { id, organizationId: ctx.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!posting) throw notFound('Load posting');
      if (!EDITABLE.includes(posting.status))
        throw invalidTransition('load posting', posting.status, 'cancel');
      await repo.update({ id }, { status: PostingStatus.CANCELLED });
      await closePendingOffers(
        manager.getRepository(MarketplaceOffer),
        { loadPostingId: id },
        ctx.organizationId,
      );
    });
    await this.audit.record({
      action: 'marketplace.load_cancelled',
      entityType: 'LoadPosting',
      entityId: id,
    });
    return this.get(ctx, id);
  }

  private baseQuery() {
    return this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.organization', 'org')
      .leftJoinAndSelect('p.pickupLocation', 'pl')
      .leftJoinAndSelect('p.deliveryLocation', 'dl');
  }

  private publishEvent(event: string, posting: AvailableLoadPosting) {
    return this.events.publish(event, {
      postingId: posting.id,
      organizationId: posting.organizationId,
    } satisfies PostingEvent);
  }
}
