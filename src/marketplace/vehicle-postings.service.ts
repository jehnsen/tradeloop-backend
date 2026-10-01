import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { AppConfig } from '../common/config/configuration';
import { DomainEventPublisher, DomainEvents, PostingEvent } from '../common/events/domain-events';
import { toPoint } from '../common/geo/geo';
import { badRequest, conflict, invalidTransition, notFound } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { LocationsService } from '../locations/locations.service';
import { Trip, TripStatus } from '../trips/entities/trip.entity';
import { PLANNING_STATUSES } from '../trips/trip-state';
import { VehiclesService } from '../vehicles/vehicles.service';
import {
  CreateVehiclePostingDto,
  MinePostingQueryDto,
  UpdateVehiclePostingDto,
  VehiclePostingQueryDto,
} from './dto/posting.dto';
import { MarketplaceOffer } from './entities/marketplace-offer.entity';
import { ACTIVE_POSTING_STATUSES, OfferStatus, PostingStatus } from './entities/marketplace.enums';
import { AvailableVehiclePosting } from './entities/vehicle-posting.entity';
import { vehiclePostingView } from './marketplace.views';
import { applyPlace, applyRadius, applyWindowOverlap } from './posting-query';
import { whereNotExpired, whereVisibleTo } from './visibility';

const EDITABLE = [PostingStatus.DRAFT, ...ACTIVE_POSTING_STATUSES];
const SORTS = {
  departureFrom: 'p.departureFrom',
  createdAt: 'p.createdAt',
  availableWeightKg: 'p.availableWeightKg',
  askingPrice: 'p.askingPrice',
};

@Injectable()
export class VehiclePostingsService {
  private readonly defaultCurrency: string;

  constructor(
    @InjectRepository(AvailableVehiclePosting)
    private readonly repo: Repository<AvailableVehiclePosting>,
    private readonly dataSource: DataSource,
    private readonly locations: LocationsService,
    private readonly vehicles: VehiclesService,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.defaultCurrency = config.get('billing', { infer: true }).defaultCurrency;
  }

  async create(ctx: TenantContext, dto: CreateVehiclePostingDto) {
    const posting = await this.dataSource.transaction(async (manager) => {
      const trip = dto.tripId
        ? await manager.getRepository(Trip).findOne({
            where: { id: dto.tripId, organizationId: ctx.organizationId },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      if (dto.tripId && !trip) throw notFound('Trip');
      if (trip && !PLANNING_STATUSES.includes(trip.status)) {
        throw conflict('TRIP_NOT_PLANNABLE', `Cannot publish capacity for a ${trip.status} trip`);
      }
      const vehicleId = dto.vehicleId ?? trip?.vehicleId ?? null;
      const vehicle = vehicleId
        ? await this.vehicles.get(ctx.organizationId, vehicleId, manager)
        : null;

      const originLocationId = dto.originLocationId ?? trip?.originLocationId;
      const destinationLocationId = dto.destinationLocationId ?? trip?.destinationLocationId;
      const departureFrom = dto.departureFrom ?? trip?.scheduledDepartureAt;
      const availableWeightKg =
        dto.availableWeightKg ?? trip?.availableWeightKg ?? vehicle?.maxWeightKg;
      const vehicleType = dto.vehicleType ?? vehicle?.vehicleType;
      if (!originLocationId || !destinationLocationId)
        throw badRequest('ROUTE_REQUIRED', 'origin and destination are required');
      if (!departureFrom) throw badRequest('SCHEDULE_REQUIRED', 'departureFrom is required');
      if (!availableWeightKg)
        throw badRequest('CAPACITY_REQUIRED', 'availableWeightKg is required');
      if (!vehicleType) throw badRequest('VEHICLE_TYPE_REQUIRED', 'vehicleType is required');
      const departureUntil = dto.departureUntil ?? departureFrom;
      if (departureUntil < departureFrom)
        throw badRequest('INVALID_WINDOW', 'departureUntil must be after departureFrom');

      const availableVolumeM3 =
        dto.availableVolumeM3 ?? trip?.availableVolumeM3 ?? vehicle?.maxVolumeM3 ?? null;
      this.assertCapacity(availableWeightKg, availableVolumeM3, trip, vehicle?.maxWeightKg ?? null);

      const origin = await this.locations.getAccessible(
        ctx.organizationId,
        originLocationId,
        manager,
      );
      const destination = await this.locations.getAccessible(
        ctx.organizationId,
        destinationLocationId,
        manager,
      );
      const repo = manager.getRepository(AvailableVehiclePosting);
      const saved = await repo.save(
        repo.create({
          organizationId: ctx.organizationId,
          tripId: trip?.id ?? null,
          vehicleId,
          originLocationId,
          destinationLocationId,
          originPoint: toPoint(origin.latitude, origin.longitude),
          destinationPoint: toPoint(destination.latitude, destination.longitude),
          departureFrom,
          departureUntil,
          availableWeightKg,
          availableVolumeM3,
          vehicleType,
          askingPrice: dto.askingPrice ?? null,
          currency: dto.currency ?? this.defaultCurrency,
          pricingType: dto.pricingType,
          visibility: dto.visibility,
          notes: dto.notes ?? null,
          expiresAt: dto.expiresAt ?? departureUntil,
          status: dto.publish === false ? PostingStatus.DRAFT : PostingStatus.OPEN,
        }),
      );
      if (trip) {
        await manager.getRepository(Trip).update(
          { id: trip.id },
          {
            isMarketplaceVisible: true,
            ...(trip.status === TripStatus.DRAFT ? { status: TripStatus.OPEN } : {}),
          },
        );
      }
      return saved;
    });
    await this.audit.record({
      action: 'marketplace.vehicle_posted',
      entityType: 'VehiclePosting',
      entityId: posting.id,
    });
    if (posting.status === PostingStatus.OPEN)
      await this.publishEvent(DomainEvents.MARKETPLACE_VEHICLE_CREATED, posting);
    return this.get(ctx, posting.id);
  }

  browse(ctx: TenantContext, query: VehiclePostingQueryDto) {
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
    if (query.vehicleType) qb.andWhere('p.vehicleType = :vt', { vt: query.vehicleType });
    if (query.minWeightKg !== undefined)
      qb.andWhere('p.availableWeightKg >= :minW', { minW: query.minWeightKg });
    if (query.minVolumeM3 !== undefined)
      qb.andWhere('p.availableVolumeM3 >= :minV', { minV: query.minVolumeM3 });
    applyRadius(
      qb,
      'p.origin_point',
      { lat: query.originLat, lng: query.originLng, radiusKm: query.originRadiusKm },
      'origin',
    );
    applyRadius(
      qb,
      'p.destination_point',
      { lat: query.destinationLat, lng: query.destinationLng, radiusKm: query.destinationRadiusKm },
      'destination',
    );
    applyPlace(qb, 'ol', query.originCity, query.originProvince, 'origin');
    applyPlace(qb, 'dl', query.destinationCity, query.destinationProvince, 'destination');
    applyWindowOverlap(qb, 'p.departureFrom', 'p.departureUntil', query.dateFrom, query.dateTo);
    return paginate(
      qb,
      { ...query, order: query.sort ? query.order : 'ASC' },
      SORTS,
      'departureFrom',
    ).then((page) => page.map((p) => vehiclePostingView(p, ctx.organizationId)));
  }

  mine(ctx: TenantContext, query: MinePostingQueryDto) {
    const qb = this.baseQuery().andWhere('p.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    return paginate(qb, query, SORTS, 'createdAt').then((page) =>
      page.map((p) => vehiclePostingView(p, ctx.organizationId)),
    );
  }

  async get(ctx: TenantContext, id: string) {
    return vehiclePostingView(await this.findVisible(ctx.organizationId, id), ctx.organizationId);
  }

  /** Returns the posting if the viewer owns it or it is published and visible to them. */
  async findVisible(viewerOrganizationId: string, id: string): Promise<AvailableVehiclePosting> {
    const qb = this.baseQuery().andWhere('p.id = :id', { id });
    whereVisibleTo(qb, 'p', viewerOrganizationId);
    qb.andWhere('(p.organizationId = :viewerOrgId OR p.status <> :draft)', {
      draft: PostingStatus.DRAFT,
    });
    const posting = await qb.getOne();
    if (!posting) throw notFound('Vehicle posting');
    return posting;
  }

  async update(ctx: TenantContext, id: string, dto: UpdateVehiclePostingDto) {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AvailableVehiclePosting);
      const posting = await repo.findOne({
        where: { id, organizationId: ctx.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!posting) throw notFound('Vehicle posting');
      if (!EDITABLE.includes(posting.status))
        throw invalidTransition('vehicle posting', posting.status, 'edit');
      Object.assign(
        posting,
        Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
      );
      if (posting.departureUntil < posting.departureFrom)
        throw badRequest('INVALID_WINDOW', 'departureUntil must be after departureFrom');
      const trip = posting.tripId
        ? await manager.getRepository(Trip).findOne({ where: { id: posting.tripId } })
        : null;
      const vehicle = posting.vehicleId
        ? await this.vehicles.get(ctx.organizationId, posting.vehicleId, manager)
        : null;
      this.assertCapacity(
        posting.availableWeightKg,
        posting.availableVolumeM3,
        trip,
        vehicle?.maxWeightKg ?? null,
      );
      if (dto.originLocationId) {
        const l = await this.locations.getAccessible(
          ctx.organizationId,
          dto.originLocationId,
          manager,
        );
        posting.originPoint = toPoint(l.latitude, l.longitude);
      }
      if (dto.destinationLocationId) {
        const l = await this.locations.getAccessible(
          ctx.organizationId,
          dto.destinationLocationId,
          manager,
        );
        posting.destinationPoint = toPoint(l.latitude, l.longitude);
      }
      return repo.save(posting);
    });
    await this.audit.record({
      action: 'marketplace.vehicle_updated',
      entityType: 'VehiclePosting',
      entityId: id,
      metadata: { changes: Object.keys(dto) },
    });
    if (ACTIVE_POSTING_STATUSES.includes(saved.status))
      await this.publishEvent(DomainEvents.MARKETPLACE_VEHICLE_UPDATED, saved);
    return this.get(ctx, id);
  }

  async publish(ctx: TenantContext, id: string) {
    const posting = await this.repo.findOne({ where: { id, organizationId: ctx.organizationId } });
    if (!posting) throw notFound('Vehicle posting');
    if (posting.status !== PostingStatus.DRAFT)
      throw invalidTransition('vehicle posting', posting.status, 'publish');
    await this.repo.update({ id }, { status: PostingStatus.OPEN });
    await this.audit.record({
      action: 'marketplace.vehicle_published',
      entityType: 'VehiclePosting',
      entityId: id,
    });
    await this.publishEvent(DomainEvents.MARKETPLACE_VEHICLE_CREATED, posting);
    return this.get(ctx, id);
  }

  async cancel(ctx: TenantContext, id: string) {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AvailableVehiclePosting);
      const posting = await repo.findOne({
        where: { id, organizationId: ctx.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!posting) throw notFound('Vehicle posting');
      if (!EDITABLE.includes(posting.status))
        throw invalidTransition('vehicle posting', posting.status, 'cancel');
      await repo.update({ id }, { status: PostingStatus.CANCELLED });
      await closePendingOffers(
        manager.getRepository(MarketplaceOffer),
        { vehiclePostingId: id },
        ctx.organizationId,
      );
      if (posting.tripId)
        await manager
          .getRepository(Trip)
          .update({ id: posting.tripId }, { isMarketplaceVisible: false });
    });
    await this.audit.record({
      action: 'marketplace.vehicle_cancelled',
      entityType: 'VehiclePosting',
      entityId: id,
    });
    return this.get(ctx, id);
  }

  private baseQuery() {
    return this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.organization', 'org')
      .leftJoinAndSelect('p.originLocation', 'ol')
      .leftJoinAndSelect('p.destinationLocation', 'dl');
  }

  private assertCapacity(
    weightKg: number,
    volumeM3: number | null,
    trip: Trip | null,
    vehicleMaxWeightKg: number | null,
  ) {
    if (trip && weightKg > trip.availableWeightKg) {
      throw conflict('CAPACITY_EXCEEDED', `Trip has only ${trip.availableWeightKg} kg available`);
    }
    if (
      trip &&
      volumeM3 !== null &&
      trip.availableVolumeM3 !== null &&
      volumeM3 > trip.availableVolumeM3
    ) {
      throw conflict('CAPACITY_EXCEEDED', `Trip has only ${trip.availableVolumeM3} m3 available`);
    }
    if (vehicleMaxWeightKg !== null && weightKg > vehicleMaxWeightKg) {
      throw conflict('CAPACITY_EXCEEDED', `Vehicle maximum is ${vehicleMaxWeightKg} kg`);
    }
  }

  private publishEvent(event: string, posting: AvailableVehiclePosting) {
    return this.events.publish(event, {
      postingId: posting.id,
      organizationId: posting.organizationId,
    } satisfies PostingEvent);
  }
}

/** Closes pending offers on a posting that is no longer available: own offers are withdrawn, others rejected. */
export async function closePendingOffers(
  offers: Repository<MarketplaceOffer>,
  where: { vehiclePostingId?: string; loadPostingId?: string },
  ownerOrganizationId: string,
  exceptOfferId?: string,
): Promise<void> {
  const pending = await offers.find({ where: { ...where, status: OfferStatus.PENDING } });
  const now = new Date();
  const close = pending.filter((o) => o.id !== exceptOfferId);
  const own = close
    .filter((o) => o.createdByOrganizationId === ownerOrganizationId)
    .map((o) => o.id);
  const others = close
    .filter((o) => o.createdByOrganizationId !== ownerOrganizationId)
    .map((o) => o.id);
  if (own.length)
    await offers.update({ id: In(own) }, { status: OfferStatus.WITHDRAWN, respondedAt: now });
  if (others.length)
    await offers.update({ id: In(others) }, { status: OfferStatus.REJECTED, respondedAt: now });
}
