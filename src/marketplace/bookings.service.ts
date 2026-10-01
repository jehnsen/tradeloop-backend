import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { calculateCommission } from '../billing/commission';
import { CommissionService } from '../billing/commission.service';
import { TenantContext } from '../common/auth/auth-context';
import {
  BookingEvent,
  DomainEventPublisher,
  DomainEvents,
  OfferEvent,
  PostingEvent,
  ShipmentStatusChangedEvent,
  TripStatusChangedEvent,
} from '../common/events/domain-events';
import { conflict, forbidden, invalidTransition, notFound } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { SequenceService } from '../common/sequence/sequence.service';
import { Load, LoadStatus } from '../loads/load.entity';
import { ShipmentsService } from '../shipments/shipments.service';
import { TripLoad, TripLoadStatus } from '../trips/entities/trip-load.entity';
import { Trip, TripStatus } from '../trips/entities/trip.entity';
import { TripAssignmentService } from '../trips/trip-assignment.service';
import { PLANNING_STATUSES } from '../trips/trip-state';
import { TripsService } from '../trips/trips.service';
import { BookingQueryDto } from './dto/offer.dto';
import { AvailableLoadPosting } from './entities/load-posting.entity';
import { MarketplaceBooking } from './entities/marketplace-booking.entity';
import { MarketplaceOffer } from './entities/marketplace-offer.entity';
import {
  ACTIVE_POSTING_STATUSES,
  BookingStatus,
  OfferStatus,
  PostingStatus,
} from './entities/marketplace.enums';
import { AvailableVehiclePosting } from './entities/vehicle-posting.entity';
import { bookingView } from './marketplace.views';
import { closePendingOffers } from './vehicle-postings.service';

/** Remaining capacity below this is treated as fully booked. */
const MIN_REMAINING_KG = 1;
const CANCELLABLE = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

const isExpired = (expiresAt: Date | null) => !!expiresAt && expiresAt.getTime() <= Date.now();

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(MarketplaceBooking) private readonly repo: Repository<MarketplaceBooking>,
    private readonly dataSource: DataSource,
    private readonly trips: TripsService,
    private readonly assignments: TripAssignmentService,
    private readonly shipments: ShipmentsService,
    private readonly commissions: CommissionService,
    private readonly sequences: SequenceService,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  /**
   * Accepts an offer and books the load in a single transaction. Rows are locked in a fixed order
   * (load posting -> offer -> vehicle posting -> trip -> load) so concurrent acceptances serialize;
   * partial unique indexes on accepted offers and active bookings are the final safeguard.
   */
  async acceptOffer(ctx: TenantContext, offerId: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const offers = manager.getRepository(MarketplaceOffer);
      // Fail fast without locks, then lock the load posting before the offer so concurrent
      // acceptances on the same load queue up on one row instead of deadlocking on offers.
      const peek = await offers.findOne({ where: { id: offerId } });
      this.assertAcceptable(ctx, peek);
      const loadPosting = await manager.getRepository(AvailableLoadPosting).findOne({
        where: { id: peek!.loadPostingId! },
        lock: { mode: 'pessimistic_write' },
      });
      const offer = await offers.findOne({
        where: { id: offerId },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertAcceptable(ctx, offer);
      if (
        !offer ||
        !loadPosting ||
        !ACTIVE_POSTING_STATUSES.includes(loadPosting.status) ||
        isExpired(loadPosting.expiresAt)
      ) {
        throw conflict('POSTING_UNAVAILABLE', 'Load posting is no longer available');
      }
      const vehiclePosting = offer.vehiclePostingId
        ? await manager.getRepository(AvailableVehiclePosting).findOne({
            where: { id: offer.vehiclePostingId },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      if (
        offer.vehiclePostingId &&
        (!vehiclePosting ||
          !ACTIVE_POSTING_STATUSES.includes(vehiclePosting.status) ||
          isExpired(vehiclePosting.expiresAt))
      ) {
        throw conflict('POSTING_UNAVAILABLE', 'Vehicle posting is no longer available');
      }

      const shipperOrganizationId = loadPosting.organizationId;
      const carrierOrganizationId =
        offer.createdByOrganizationId === shipperOrganizationId
          ? offer.targetOrganizationId
          : offer.createdByOrganizationId;
      if (vehiclePosting && vehiclePosting.organizationId !== carrierOrganizationId) {
        throw conflict('INVALID_OFFER', 'Vehicle posting does not belong to the carrier');
      }
      if (vehiclePosting && vehiclePosting.availableWeightKg < loadPosting.weightKg) {
        throw conflict('CAPACITY_EXCEEDED', 'Vehicle posting no longer has enough capacity');
      }

      let tripId = vehiclePosting?.tripId ?? null;
      if (!tripId) {
        const trip = await this.trips.createInTx(
          manager,
          carrierOrganizationId,
          {
            vehicleId: vehiclePosting?.vehicleId ?? undefined,
            originLocationId: vehiclePosting?.originLocationId ?? loadPosting.pickupLocationId,
            destinationLocationId:
              vehiclePosting?.destinationLocationId ?? loadPosting.deliveryLocationId,
            scheduledDepartureAt: vehiclePosting?.departureFrom ?? loadPosting.pickupFrom,
            maxWeightKg: vehiclePosting?.availableWeightKg ?? loadPosting.weightKg,
            maxVolumeM3: vehiclePosting?.availableVolumeM3 ?? loadPosting.volumeM3 ?? undefined,
            notes: `Created for marketplace offer ${offer.id}`,
          },
          { crossOrganizationLocations: true },
        );
        tripId = trip.id;
        if (vehiclePosting) vehiclePosting.tripId = trip.id;
      }

      let loadId = loadPosting.loadId;
      if (!loadId) {
        const loads = manager.getRepository(Load);
        const load = await loads.save(
          loads.create({
            organizationId: shipperOrganizationId,
            description: (loadPosting.notes ?? `Marketplace load ${loadPosting.id}`).slice(0, 300),
            weightKg: loadPosting.weightKg,
            volumeM3: loadPosting.volumeM3,
            requiredVehicleType: loadPosting.requiredVehicleType,
            status: LoadStatus.PENDING,
          }),
        );
        loadId = load.id;
        loadPosting.loadId = load.id;
      }

      const commission = calculateCommission(
        offer.amount,
        await this.commissions.ruleFor(carrierOrganizationId, manager),
      );
      const bookings = manager.getRepository(MarketplaceBooking);
      const booking = await bookings.save(
        bookings.create({
          bookingNumber: await this.sequences.next('BKG', 'GLOBAL', manager),
          loadPostingId: loadPosting.id,
          vehiclePostingId: vehiclePosting?.id ?? null,
          offerId: offer.id,
          shipperOrganizationId,
          carrierOrganizationId,
          tripId,
          loadId,
          agreedAmount: offer.amount,
          currency: offer.currency,
          ...commission,
          status: BookingStatus.CONFIRMED,
        }),
      );

      const assignment = await this.assignments.assignInTx(manager, {
        organizationId: carrierOrganizationId,
        tripId,
        loadId,
        pickupLocationId: loadPosting.pickupLocationId,
        dropoffLocationId: loadPosting.deliveryLocationId,
        crossOrganization: true,
        bookingId: booking.id,
      });

      offer.status = OfferStatus.ACCEPTED;
      offer.respondedAt = new Date();
      await offers.save(offer);
      await closePendingOffers(
        offers,
        { loadPostingId: loadPosting.id },
        shipperOrganizationId,
        offer.id,
      );

      loadPosting.status = PostingStatus.BOOKED;
      await manager.getRepository(AvailableLoadPosting).save(loadPosting);

      if (vehiclePosting) {
        const remaining = Math.min(
          vehiclePosting.availableWeightKg - loadPosting.weightKg,
          assignment.trip.availableWeightKg,
        );
        vehiclePosting.availableWeightKg = Math.max(0, Math.round(remaining * 100) / 100);
        if (vehiclePosting.availableVolumeM3 !== null && loadPosting.volumeM3 !== null) {
          vehiclePosting.availableVolumeM3 = Math.max(
            0,
            Math.round((vehiclePosting.availableVolumeM3 - loadPosting.volumeM3) * 100) / 100,
          );
        }
        if (vehiclePosting.availableWeightKg < MIN_REMAINING_KG) {
          vehiclePosting.status = PostingStatus.BOOKED;
          await closePendingOffers(
            offers,
            { vehiclePostingId: vehiclePosting.id },
            carrierOrganizationId,
            offer.id,
          );
        }
        await manager.getRepository(AvailableVehiclePosting).save(vehiclePosting);
      }

      await this.audit.record(
        {
          action: 'offer.accepted',
          entityType: 'MarketplaceOffer',
          entityId: offer.id,
          metadata: { amount: offer.amount, currency: offer.currency },
        },
        manager,
      );
      // Bookings are shared records, so both parties get the entry in their own audit trail.
      for (const organizationId of [shipperOrganizationId, carrierOrganizationId]) {
        await this.audit.record(
          {
            action: 'booking.created',
            entityType: 'MarketplaceBooking',
            entityId: booking.id,
            organizationId,
            metadata: {
              bookingNumber: booking.bookingNumber,
              tripId,
              loadId,
              shipperOrganizationId,
              carrierOrganizationId,
              agreedAmount: booking.agreedAmount,
              ...(organizationId === carrierOrganizationId ? commission : {}),
            },
          },
          manager,
        );
      }
      return { booking, offer, assignment, vehiclePosting };
    });

    await this.assignments.publishAssigned(result.assignment);
    await this.events.publish(DomainEvents.OFFER_ACCEPTED, this.offerEvent(result.offer));
    await this.events.publish(DomainEvents.BOOKING_CREATED, this.bookingEvent(result.booking));
    if (result.vehiclePosting && result.vehiclePosting.status !== PostingStatus.BOOKED) {
      await this.events.publish(DomainEvents.MARKETPLACE_VEHICLE_UPDATED, {
        postingId: result.vehiclePosting.id,
        organizationId: result.vehiclePosting.organizationId,
      } satisfies PostingEvent);
    }
    return this.get(ctx, result.booking.id);
  }

  private assertAcceptable(ctx: TenantContext, offer: MarketplaceOffer | null): void {
    if (
      !offer ||
      ![offer.targetOrganizationId, offer.createdByOrganizationId].includes(ctx.organizationId)
    ) {
      throw notFound('Offer');
    }
    if (offer.targetOrganizationId !== ctx.organizationId) {
      throw forbidden(
        'OFFER_NOT_ACCEPTABLE',
        'Only the receiving organization can accept an offer',
      );
    }
    if (offer.status !== OfferStatus.PENDING)
      throw invalidTransition('offer', offer.status, 'accept');
    if (isExpired(offer.expiresAt)) throw conflict('OFFER_EXPIRED', 'Offer has expired');
    if (!offer.loadPostingId)
      throw conflict('LOAD_POSTING_REQUIRED', 'Offer is not linked to a load posting');
  }

  list(ctx: TenantContext, query: BookingQueryDto) {
    const qb = this.baseQuery();
    if (query.role === 'shipper')
      qb.andWhere('b.shipperOrganizationId = :org', { org: ctx.organizationId });
    else if (query.role === 'carrier')
      qb.andWhere('b.carrierOrganizationId = :org', { org: ctx.organizationId });
    else {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('b.shipperOrganizationId = :org', { org: ctx.organizationId })
            .orWhere('b.carrierOrganizationId = :org'),
        ),
      );
    }
    if (query.status) qb.andWhere('b.status = :status', { status: query.status });
    if (query.tripId) qb.andWhere('b.tripId = :tripId', { tripId: query.tripId });
    return paginate(
      qb,
      query,
      { createdAt: 'b.createdAt', agreedAmount: 'b.agreedAmount' },
      'createdAt',
    ).then((page) => page.map((b) => bookingView(b, ctx.organizationId)));
  }

  async get(ctx: TenantContext, id: string) {
    const booking = await this.baseQuery()
      .andWhere('b.id = :id', { id })
      .andWhere('(b.shipperOrganizationId = :org OR b.carrierOrganizationId = :org)', {
        org: ctx.organizationId,
      })
      .getOne();
    if (!booking) throw notFound('Booking');
    return bookingView(booking, ctx.organizationId);
  }

  async cancel(ctx: TenantContext, id: string, reason?: string) {
    const { booking, shipmentChanges } = await this.dataSource.transaction(async (manager) => {
      const booking = await manager
        .getRepository(MarketplaceBooking)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (
        !booking ||
        ![booking.shipperOrganizationId, booking.carrierOrganizationId].includes(ctx.organizationId)
      ) {
        throw notFound('Booking');
      }
      return this.cancelInTx(manager, booking, reason ?? null, true);
    });
    await this.shipments.publishChanges(shipmentChanges);
    await this.events.publish(DomainEvents.BOOKING_CANCELLED, this.bookingEvent(booking));
    return this.get(ctx, id);
  }

  /** Cancels a booking and reopens capacity. releaseTripLoad=false when the trip already released it. */
  private async cancelInTx(
    manager: EntityManager,
    booking: MarketplaceBooking,
    reason: string | null,
    releaseTripLoad: boolean,
  ) {
    if (!CANCELLABLE.includes(booking.status))
      throw invalidTransition('booking', booking.status, 'cancel');
    // Lock order mirrors acceptOffer: load posting -> vehicle posting -> trip.
    const loadPosting = await manager.getRepository(AvailableLoadPosting).findOne({
      where: { id: booking.loadPostingId },
      lock: { mode: 'pessimistic_write' },
    });
    const vehiclePosting = booking.vehiclePostingId
      ? await manager.getRepository(AvailableVehiclePosting).findOne({
          where: { id: booking.vehiclePostingId },
          lock: { mode: 'pessimistic_write' },
        })
      : null;
    const trip = await manager
      .getRepository(Trip)
      .findOne({ where: { id: booking.tripId }, lock: { mode: 'pessimistic_write' } });

    let shipmentChanges: ShipmentStatusChangedEvent[] = [];
    if (releaseTripLoad && trip) {
      if (!PLANNING_STATUSES.includes(trip.status) && trip.status !== TripStatus.DISPATCHED) {
        throw conflict(
          'BOOKING_IN_PROGRESS',
          `Trip is ${trip.status}; booking can no longer be cancelled`,
        );
      }
      const tripLoad = await manager.getRepository(TripLoad).findOne({
        where: { bookingId: booking.id, status: TripLoadStatus.ASSIGNED },
      });
      if (tripLoad) shipmentChanges = await this.assignments.releaseInTx(manager, trip, tripLoad);
    }

    if (loadPosting && loadPosting.status === PostingStatus.BOOKED) {
      loadPosting.status = isExpired(loadPosting.expiresAt)
        ? PostingStatus.EXPIRED
        : PostingStatus.OPEN;
      await manager.getRepository(AvailableLoadPosting).save(loadPosting);
    }
    const vp = vehiclePosting;
    if (
      vp &&
      loadPosting &&
      [...ACTIVE_POSTING_STATUSES, PostingStatus.BOOKED].includes(vp.status)
    ) {
      const restored = vp.availableWeightKg + loadPosting.weightKg;
      vp.availableWeightKg = trip ? Math.min(restored, trip.availableWeightKg) : restored;
      if (vp.availableVolumeM3 !== null && loadPosting.volumeM3 !== null)
        vp.availableVolumeM3 += loadPosting.volumeM3;
      if (vp.status === PostingStatus.BOOKED)
        vp.status = isExpired(vp.expiresAt) ? PostingStatus.EXPIRED : PostingStatus.OPEN;
      await manager.getRepository(AvailableVehiclePosting).save(vp);
    }
    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    booking.cancellationReason = reason;
    await manager.getRepository(MarketplaceBooking).save(booking);
    await this.audit.record(
      {
        action: 'booking.cancelled',
        entityType: 'MarketplaceBooking',
        entityId: booking.id,
        metadata: { reason },
      },
      manager,
    );
    return { booking, shipmentChanges };
  }

  @OnEvent(DomainEvents.TRIP_STARTED)
  async onTripStarted(event: TripStatusChangedEvent): Promise<void> {
    await this.repo.update(
      { tripId: event.tripId, status: BookingStatus.CONFIRMED },
      { status: BookingStatus.IN_PROGRESS },
    );
  }

  /** Completes bookings on a finished trip and finalizes the commission from the stored rule. */
  @OnEvent(DomainEvents.TRIP_COMPLETED)
  async onTripCompleted(event: TripStatusChangedEvent): Promise<void> {
    const completed = await this.dataSource.transaction(async (manager) => {
      const bookings = await manager.getRepository(MarketplaceBooking).find({
        where: {
          tripId: event.tripId,
          status: In([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS]),
        },
        lock: { mode: 'pessimistic_write' },
      });
      for (const booking of bookings) {
        const commission = calculateCommission(booking.agreedAmount, {
          type: booking.platformCommissionType,
          value: booking.platformCommissionValue,
        });
        Object.assign(booking, commission, {
          status: BookingStatus.COMPLETED,
          completedAt: new Date(),
        });
        await manager.getRepository(MarketplaceBooking).save(booking);
        await this.audit.record(
          {
            action: 'booking.completed',
            entityType: 'MarketplaceBooking',
            entityId: booking.id,
            organizationId: booking.carrierOrganizationId,
            metadata: {
              ...commission,
              agreedAmount: booking.agreedAmount,
              currency: booking.currency,
            },
          },
          manager,
        );
      }
      return bookings;
    });
    for (const booking of completed)
      await this.events.publish(DomainEvents.BOOKING_COMPLETED, this.bookingEvent(booking));
  }

  @OnEvent(DomainEvents.TRIP_CANCELLED)
  async onTripCancelled(event: TripStatusChangedEvent): Promise<void> {
    const cancelled = await this.dataSource.transaction(async (manager) => {
      const bookings = await manager.getRepository(MarketplaceBooking).find({
        where: { tripId: event.tripId, status: In(CANCELLABLE) },
        lock: { mode: 'pessimistic_write' },
      });
      for (const booking of bookings)
        await this.cancelInTx(manager, booking, 'Trip cancelled by carrier', false);
      return bookings;
    });
    for (const booking of cancelled)
      await this.events.publish(DomainEvents.BOOKING_CANCELLED, this.bookingEvent(booking));
  }

  /** Whether the organization is the shipper on an active booking for the trip (grants tracking access). */
  hasShipperAccess(organizationId: string, tripId: string): Promise<boolean> {
    return this.repo.exists({
      where: {
        tripId,
        shipperOrganizationId: organizationId,
        status: In([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED]),
      },
    });
  }

  private baseQuery() {
    return this.repo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.shipperOrganization', 'so')
      .leftJoinAndSelect('b.carrierOrganization', 'co');
  }

  offerEvent(offer: MarketplaceOffer): OfferEvent {
    return {
      offerId: offer.id,
      createdByOrganizationId: offer.createdByOrganizationId,
      targetOrganizationId: offer.targetOrganizationId,
      amount: offer.amount,
      currency: offer.currency,
      isCounter: !!offer.parentOfferId,
    };
  }

  private bookingEvent(b: MarketplaceBooking): BookingEvent {
    return {
      bookingId: b.id,
      bookingNumber: b.bookingNumber,
      shipperOrganizationId: b.shipperOrganizationId,
      carrierOrganizationId: b.carrierOrganizationId,
      tripId: b.tripId,
    };
  }
}
