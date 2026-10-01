import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { AppConfig } from '../common/config/configuration';
import { DomainEventPublisher, DomainEvents } from '../common/events/domain-events';
import {
  badRequest,
  conflict,
  forbidden,
  invalidTransition,
  notFound,
} from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { BookingsService } from './bookings.service';
import { CounterOfferDto, CreateOfferDto, OfferQueryDto } from './dto/offer.dto';
import { AvailableLoadPosting } from './entities/load-posting.entity';
import { MarketplaceOffer } from './entities/marketplace-offer.entity';
import { ACTIVE_POSTING_STATUSES, OfferStatus } from './entities/marketplace.enums';
import { AvailableVehiclePosting } from './entities/vehicle-posting.entity';
import { LoadPostingsService } from './load-postings.service';
import { offerView } from './marketplace.views';
import { VehiclePostingsService } from './vehicle-postings.service';

const DEFAULT_OFFER_TTL_MS = 72 * 3_600_000;

@Injectable()
export class OffersService {
  private readonly defaultCurrency: string;

  constructor(
    @InjectRepository(MarketplaceOffer) private readonly repo: Repository<MarketplaceOffer>,
    private readonly dataSource: DataSource,
    private readonly vehiclePostings: VehiclePostingsService,
    private readonly loadPostings: LoadPostingsService,
    private readonly bookings: BookingsService,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.defaultCurrency = config.get('billing', { infer: true }).defaultCurrency;
  }

  /**
   * A carrier bids on another tenant's load posting (optionally offering one of its own vehicle
   * postings), or a shipper requests another tenant's truck for one of its own load postings.
   */
  async create(ctx: TenantContext, dto: CreateOfferDto) {
    if (!dto.loadPostingId && !dto.vehiclePostingId) {
      throw badRequest('POSTING_REQUIRED', 'loadPostingId or vehiclePostingId is required');
    }
    const org = ctx.organizationId;
    const loadPosting = dto.loadPostingId
      ? await this.loadPostings.findVisible(org, dto.loadPostingId)
      : null;
    const vehiclePosting = dto.vehiclePostingId
      ? await this.vehiclePostings.findVisible(org, dto.vehiclePostingId)
      : null;

    let targetOrganizationId: string;
    if (loadPosting && loadPosting.organizationId !== org) {
      if (vehiclePosting && vehiclePosting.organizationId !== org) {
        throw badRequest(
          'INVALID_OFFER',
          'When bidding on a load, vehiclePostingId must be one of your own postings',
        );
      }
      targetOrganizationId = loadPosting.organizationId;
    } else if (vehiclePosting && vehiclePosting.organizationId !== org) {
      if (!loadPosting) {
        throw badRequest(
          'LOAD_POSTING_REQUIRED',
          'Requesting a truck requires loadPostingId of your own load posting',
        );
      }
      targetOrganizationId = vehiclePosting.organizationId;
    } else {
      throw badRequest('INVALID_OFFER', "Offers must target another organization's posting");
    }

    for (const posting of [loadPosting, vehiclePosting]) {
      if (!posting) continue;
      if (
        !ACTIVE_POSTING_STATUSES.includes(posting.status) ||
        (posting.expiresAt && posting.expiresAt <= new Date())
      ) {
        throw conflict('POSTING_UNAVAILABLE', 'Posting is not open for offers');
      }
    }
    if (loadPosting && vehiclePosting) {
      if (vehiclePosting.availableWeightKg < loadPosting.weightKg) {
        throw conflict('CAPACITY_EXCEEDED', 'Vehicle posting capacity is below the load weight');
      }
      if (
        loadPosting.requiredVehicleType &&
        loadPosting.requiredVehicleType !== vehiclePosting.vehicleType
      ) {
        throw conflict(
          'VEHICLE_TYPE_MISMATCH',
          `Load requires a ${loadPosting.requiredVehicleType} vehicle`,
        );
      }
    }
    const duplicate = await this.repo.exists({
      where: {
        createdByOrganizationId: org,
        loadPostingId: dto.loadPostingId ?? undefined,
        vehiclePostingId: dto.vehiclePostingId ?? undefined,
        status: OfferStatus.PENDING,
      },
    });
    if (duplicate)
      throw conflict('DUPLICATE_OFFER', 'You already have a pending offer for this posting');

    const offer = await this.repo.save(
      this.repo.create({
        organizationId: org,
        createdByOrganizationId: org,
        targetOrganizationId,
        createdByUserId: ctx.userId,
        loadPostingId: loadPosting?.id ?? null,
        vehiclePostingId: vehiclePosting?.id ?? null,
        amount: dto.amount,
        currency:
          dto.currency ?? loadPosting?.currency ?? vehiclePosting?.currency ?? this.defaultCurrency,
        message: dto.message ?? null,
        expiresAt: this.expiry(dto.expiresAt, [loadPosting?.expiresAt, vehiclePosting?.expiresAt]),
        status: OfferStatus.PENDING,
      }),
    );
    await this.audit.record({
      action: 'offer.created',
      entityType: 'MarketplaceOffer',
      entityId: offer.id,
      metadata: { amount: offer.amount, targetOrganizationId },
    });
    await this.events.publish(DomainEvents.OFFER_CREATED, this.bookings.offerEvent(offer));
    return this.get(ctx, offer.id);
  }

  async counter(ctx: TenantContext, id: string, dto: CounterOfferDto) {
    const counter = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MarketplaceOffer);
      const original = await this.lockForTarget(repo, ctx, id, 'counter');
      original.status = OfferStatus.COUNTERED;
      original.respondedAt = new Date();
      await repo.save(original);
      const [lp, vp] = await Promise.all([
        original.loadPostingId
          ? manager
              .getRepository(AvailableLoadPosting)
              .findOne({ where: { id: original.loadPostingId } })
          : null,
        original.vehiclePostingId
          ? manager
              .getRepository(AvailableVehiclePosting)
              .findOne({ where: { id: original.vehiclePostingId } })
          : null,
      ]);
      return repo.save(
        repo.create({
          organizationId: ctx.organizationId,
          createdByOrganizationId: ctx.organizationId,
          targetOrganizationId: original.createdByOrganizationId,
          createdByUserId: ctx.userId,
          loadPostingId: original.loadPostingId,
          vehiclePostingId: original.vehiclePostingId,
          parentOfferId: original.id,
          amount: dto.amount,
          currency: original.currency,
          message: dto.message ?? null,
          expiresAt: this.expiry(dto.expiresAt, [lp?.expiresAt, vp?.expiresAt]),
          status: OfferStatus.PENDING,
        }),
      );
    });
    await this.audit.record({
      action: 'offer.countered',
      entityType: 'MarketplaceOffer',
      entityId: id,
      metadata: { counterOfferId: counter.id, amount: dto.amount },
    });
    await this.events.publish(DomainEvents.OFFER_CREATED, this.bookings.offerEvent(counter));
    return this.get(ctx, counter.id);
  }

  accept(ctx: TenantContext, id: string) {
    return this.bookings.acceptOffer(ctx, id);
  }

  async reject(ctx: TenantContext, id: string) {
    const offer = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MarketplaceOffer);
      const o = await this.lockForTarget(repo, ctx, id, 'reject');
      o.status = OfferStatus.REJECTED;
      o.respondedAt = new Date();
      return repo.save(o);
    });
    await this.audit.record({
      action: 'offer.rejected',
      entityType: 'MarketplaceOffer',
      entityId: id,
    });
    await this.events.publish(DomainEvents.OFFER_REJECTED, this.bookings.offerEvent(offer));
    return this.get(ctx, id);
  }

  async withdraw(ctx: TenantContext, id: string) {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MarketplaceOffer);
      const o = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!o || ![o.createdByOrganizationId, o.targetOrganizationId].includes(ctx.organizationId))
        throw notFound('Offer');
      if (o.createdByOrganizationId !== ctx.organizationId) {
        throw forbidden(
          'OFFER_NOT_WITHDRAWABLE',
          'Only the organization that made the offer can withdraw it',
        );
      }
      if (o.status !== OfferStatus.PENDING) throw invalidTransition('offer', o.status, 'withdraw');
      o.status = OfferStatus.WITHDRAWN;
      o.respondedAt = new Date();
      await repo.save(o);
    });
    await this.audit.record({
      action: 'offer.withdrawn',
      entityType: 'MarketplaceOffer',
      entityId: id,
    });
    return this.get(ctx, id);
  }

  listReceived(ctx: TenantContext, query: OfferQueryDto) {
    return this.list(ctx, query, 'o.targetOrganizationId = :org');
  }

  listSent(ctx: TenantContext, query: OfferQueryDto) {
    return this.list(ctx, query, 'o.createdByOrganizationId = :org');
  }

  async get(ctx: TenantContext, id: string) {
    const offer = await this.baseQuery()
      .andWhere('o.id = :id', { id })
      .andWhere('(o.createdByOrganizationId = :org OR o.targetOrganizationId = :org)', {
        org: ctx.organizationId,
      })
      .getOne();
    if (!offer) throw notFound('Offer');
    return offerView(offer, ctx.organizationId);
  }

  private list(ctx: TenantContext, query: OfferQueryDto, scope: string) {
    const qb = this.baseQuery().andWhere(scope, { org: ctx.organizationId });
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.loadPostingId) qb.andWhere('o.loadPostingId = :lp', { lp: query.loadPostingId });
    if (query.vehiclePostingId)
      qb.andWhere('o.vehiclePostingId = :vp', { vp: query.vehiclePostingId });
    return paginate(qb, query, { createdAt: 'o.createdAt', amount: 'o.amount' }, 'createdAt').then(
      (page) => page.map((o) => offerView(o, ctx.organizationId)),
    );
  }

  private baseQuery() {
    return this.repo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.createdByOrganization', 'co')
      .leftJoinAndSelect('o.targetOrganization', 'tor')
      .leftJoinAndSelect('o.loadPosting', 'lp')
      .leftJoinAndSelect('lp.organization', 'lpo')
      .leftJoinAndSelect('lp.pickupLocation', 'lppl')
      .leftJoinAndSelect('lp.deliveryLocation', 'lpdl')
      .leftJoinAndSelect('o.vehiclePosting', 'vp')
      .leftJoinAndSelect('vp.organization', 'vpo')
      .leftJoinAndSelect('vp.originLocation', 'vpol')
      .leftJoinAndSelect('vp.destinationLocation', 'vpdl');
  }

  private async lockForTarget(
    repo: Repository<MarketplaceOffer>,
    ctx: TenantContext,
    id: string,
    action: string,
  ) {
    const offer = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (
      !offer ||
      ![offer.createdByOrganizationId, offer.targetOrganizationId].includes(ctx.organizationId)
    ) {
      throw notFound('Offer');
    }
    if (offer.targetOrganizationId !== ctx.organizationId) {
      throw forbidden(
        'OFFER_NOT_TARGETED',
        `Only the receiving organization can ${action} this offer`,
      );
    }
    if (offer.status !== OfferStatus.PENDING)
      throw invalidTransition('offer', offer.status, action);
    if (offer.expiresAt && offer.expiresAt <= new Date())
      throw conflict('OFFER_EXPIRED', 'Offer has expired');
    return offer;
  }

  private expiry(
    requested: Date | undefined,
    postingExpiries: Array<Date | null | undefined>,
  ): Date {
    const candidates = [
      requested ?? new Date(Date.now() + DEFAULT_OFFER_TTL_MS),
      ...postingExpiries,
    ].filter((d): d is Date => d instanceof Date);
    const earliest = new Date(Math.min(...candidates.map((d) => d.getTime())));
    if (earliest <= new Date())
      throw badRequest('INVALID_EXPIRY', 'Offer expiry must be in the future');
    return earliest;
  }
}
