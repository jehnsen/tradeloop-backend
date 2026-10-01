import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { RoleGroups } from '../common/enums';
import {
  DeliveryCompletedEvent,
  DomainEvents,
  MatchFoundEvent,
  OfferEvent,
  TripLoadAssignedEvent,
  TripStatusChangedEvent,
} from '../common/events/domain-events';
import { MarketplaceBooking } from '../marketplace/entities/marketplace-booking.entity';
import { BookingStatus } from '../marketplace/entities/marketplace.enums';
import { NotificationTypes } from './notification.types';
import { NotificationsService } from './notifications.service';

/** Translates domain events into in-app notifications (delivered asynchronously via the queue). */
@Injectable()
export class NotificationEventsListener {
  constructor(
    private readonly notifications: NotificationsService,
    @InjectRepository(MarketplaceBooking) private readonly bookings: Repository<MarketplaceBooking>,
  ) {}

  @OnEvent(DomainEvents.MATCH_FOUND)
  async onMatchFound(e: MatchFoundEvent): Promise<void> {
    const data = {
      loadPostingId: e.loadPostingId,
      vehiclePostingId: e.vehiclePostingId,
      score: e.score,
    };
    await this.notifications.notify({
      organizationId: e.vehicleOrganizationId,
      roles: RoleGroups.COMMERCIAL,
      type: NotificationTypes.MATCH_FOUND,
      title: 'New load match for your truck',
      message: `A load matching your available capacity was posted (score ${e.score}).`,
      data,
      dedupeKey: `match:${e.loadPostingId}:${e.vehiclePostingId}`,
    });
    await this.notifications.notify({
      organizationId: e.loadOrganizationId,
      roles: RoleGroups.COMMERCIAL,
      type: NotificationTypes.MATCH_FOUND,
      title: 'New truck match for your load',
      message: `Available truck capacity matches your load (score ${e.score}).`,
      data,
      dedupeKey: `match:${e.loadPostingId}:${e.vehiclePostingId}`,
    });
  }

  @OnEvent(DomainEvents.OFFER_CREATED)
  async onOfferCreated(e: OfferEvent): Promise<void> {
    await this.notifications.notify({
      organizationId: e.targetOrganizationId,
      roles: RoleGroups.COMMERCIAL,
      type: NotificationTypes.OFFER_RECEIVED,
      title: e.isCounter ? 'Counter offer received' : 'New offer received',
      message: `Offer of ${e.currency} ${e.amount.toFixed(2)}.`,
      data: { offerId: e.offerId },
      dedupeKey: `offer:${e.offerId}`,
    });
  }

  @OnEvent(DomainEvents.OFFER_ACCEPTED)
  async onOfferAccepted(e: OfferEvent): Promise<void> {
    await this.notifications.notify({
      organizationId: e.createdByOrganizationId,
      roles: RoleGroups.COMMERCIAL,
      type: NotificationTypes.OFFER_ACCEPTED,
      title: 'Offer accepted',
      message: `Your offer of ${e.currency} ${e.amount.toFixed(2)} was accepted and a booking was created.`,
      data: { offerId: e.offerId },
      dedupeKey: `offer-accepted:${e.offerId}`,
    });
  }

  @OnEvent(DomainEvents.OFFER_REJECTED)
  async onOfferRejected(e: OfferEvent): Promise<void> {
    await this.notifications.notify({
      organizationId: e.createdByOrganizationId,
      roles: RoleGroups.COMMERCIAL,
      type: NotificationTypes.OFFER_REJECTED,
      title: 'Offer rejected',
      message: `Your offer of ${e.currency} ${e.amount.toFixed(2)} was rejected.`,
      data: { offerId: e.offerId },
      dedupeKey: `offer-rejected:${e.offerId}`,
    });
  }

  @OnEvent(DomainEvents.TRIP_LOAD_ASSIGNED)
  async onLoadAssigned(e: TripLoadAssignedEvent): Promise<void> {
    const data = { tripId: e.tripId, loadId: e.loadId, bookingId: e.bookingId };
    if (e.driverUserId) {
      await this.notifications.notify({
        organizationId: e.organizationId,
        userIds: [e.driverUserId],
        type: NotificationTypes.TRIP_ASSIGNED,
        title: 'Load added to your trip',
        message: `A load was assigned to trip ${e.tripNumber}.`,
        data,
        dedupeKey: `trip-assigned:${e.tripId}:${e.loadId}`,
      });
    }
    if (e.loadOrganizationId !== e.organizationId) {
      await this.notifications.notify({
        organizationId: e.loadOrganizationId,
        roles: RoleGroups.OPERATIONS,
        type: NotificationTypes.TRIP_ASSIGNED,
        title: 'Your load was assigned to a carrier trip',
        message: 'The carrier has scheduled your booked load on a trip.',
        data: { tripId: e.tripId, loadId: e.loadId, bookingId: e.bookingId },
        dedupeKey: `trip-assigned:${e.tripId}:${e.loadId}`,
      });
    }
  }

  @OnEvent(DomainEvents.TRIP_DISPATCHED)
  async onDispatched(e: TripStatusChangedEvent): Promise<void> {
    if (e.driverUserId) {
      await this.notifications.notify({
        organizationId: e.organizationId,
        userIds: [e.driverUserId],
        type: NotificationTypes.TRIP_DISPATCHED,
        title: 'Trip dispatched',
        message: `Trip ${e.tripNumber} has been dispatched to you.`,
        data: { tripId: e.tripId },
        dedupeKey: `trip-dispatched:${e.tripId}`,
      });
    }
    await this.tripUpdate(e, NotificationTypes.TRIP_DISPATCHED, 'dispatched');
  }

  @OnEvent(DomainEvents.TRIP_STARTED)
  onStarted(e: TripStatusChangedEvent): Promise<void> {
    return this.tripUpdate(e, NotificationTypes.TRIP_STARTED, 'started');
  }

  @OnEvent(DomainEvents.TRIP_COMPLETED)
  onCompleted(e: TripStatusChangedEvent): Promise<void> {
    return this.tripUpdate(e, NotificationTypes.TRIP_COMPLETED, 'completed');
  }

  @OnEvent(DomainEvents.DELIVERY_COMPLETED)
  async onDelivered(e: DeliveryCompletedEvent): Promise<void> {
    for (const organizationId of new Set([e.organizationId, ...e.loadOrganizationIds])) {
      await this.notifications.notify({
        organizationId,
        roles: RoleGroups.OPERATIONS,
        type: NotificationTypes.DELIVERY_COMPLETED,
        title: 'Delivery completed',
        message: `${e.loadIds.length} load(s) delivered.`,
        data: {
          tripId: e.tripId,
          stopId: e.stopId,
          loadIds: organizationId === e.organizationId ? e.loadIds : undefined,
        },
        dedupeKey: `delivered:${e.tripId}:${e.stopId}`,
      });
    }
  }

  /** Notifies the carrier's operations team and any shipper with a booking on the trip. */
  private async tripUpdate(e: TripStatusChangedEvent, type: string, verb: string): Promise<void> {
    await this.notifications.notify({
      organizationId: e.organizationId,
      roles: RoleGroups.OPERATIONS,
      type,
      title: `Trip ${verb}`,
      message: `Trip ${e.tripNumber} was ${verb}.`,
      data: { tripId: e.tripId },
      dedupeKey: `trip-${verb}:${e.tripId}`,
    });
    const bookings = await this.bookings.find({
      where: { tripId: e.tripId, status: Not(In([BookingStatus.CANCELLED])) },
      select: { id: true, shipperOrganizationId: true },
    });
    for (const booking of bookings) {
      await this.notifications.notify({
        organizationId: booking.shipperOrganizationId,
        roles: RoleGroups.OPERATIONS,
        type,
        title: `Carrier trip ${verb}`,
        message: `The trip carrying your booked load was ${verb}.`,
        data: { tripId: e.tripId, bookingId: booking.id },
        dedupeKey: `trip-${verb}:${e.tripId}:${booking.id}`,
      });
    }
  }
}
