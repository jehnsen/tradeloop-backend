import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export const DomainEvents = {
  ORDER_CREATED: 'order.created',
  SHIPMENT_CREATED: 'shipment.created',
  SHIPMENT_STATUS_CHANGED: 'shipment.status.changed',
  LOAD_CREATED: 'load.created',
  TRIP_CREATED: 'trip.created',
  TRIP_STATUS_CHANGED: 'trip.status.changed',
  TRIP_DISPATCHED: 'trip.dispatched',
  TRIP_STARTED: 'trip.started',
  TRIP_COMPLETED: 'trip.completed',
  TRIP_CANCELLED: 'trip.cancelled',
  TRIP_LOAD_ASSIGNED: 'trip.load.assigned',
  DELIVERY_COMPLETED: 'delivery.completed',
  MARKETPLACE_LOAD_CREATED: 'marketplace.load.created',
  MARKETPLACE_LOAD_UPDATED: 'marketplace.load.updated',
  MARKETPLACE_VEHICLE_CREATED: 'marketplace.vehicle.created',
  MARKETPLACE_VEHICLE_UPDATED: 'marketplace.vehicle.updated',
  MATCH_FOUND: 'match.found',
  OFFER_CREATED: 'offer.created',
  OFFER_ACCEPTED: 'offer.accepted',
  OFFER_REJECTED: 'offer.rejected',
  BOOKING_CREATED: 'booking.created',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',
  VEHICLE_LOCATION_UPDATED: 'vehicle.location.updated',
} as const;

export interface OrderCreatedEvent {
  orderId: string;
  organizationId: string;
  orderNumber: string;
}

export interface ShipmentStatusChangedEvent {
  shipmentId: string;
  organizationId: string;
  orderId: string | null;
  status: string;
}

export interface EntityCreatedEvent {
  id: string;
  organizationId: string;
}

export interface TripStatusChangedEvent {
  tripId: string;
  organizationId: string;
  tripNumber: string;
  from: string;
  to: string;
  driverUserId: string | null;
  at: Date;
}

export interface TripLoadAssignedEvent {
  tripId: string;
  tripNumber: string;
  organizationId: string;
  loadId: string;
  loadOrganizationId: string;
  bookingId: string | null;
  driverUserId: string | null;
}

export interface DeliveryCompletedEvent {
  tripId: string;
  organizationId: string;
  stopId: string;
  loadIds: string[];
  loadOrganizationIds: string[];
}

export interface PostingEvent {
  postingId: string;
  organizationId: string;
}

export interface MatchFoundEvent {
  loadPostingId: string;
  vehiclePostingId: string;
  loadOrganizationId: string;
  vehicleOrganizationId: string;
  score: number;
}

export interface OfferEvent {
  offerId: string;
  createdByOrganizationId: string;
  targetOrganizationId: string;
  amount: number;
  currency: string;
  isCounter: boolean;
}

export interface BookingEvent {
  bookingId: string;
  bookingNumber: string;
  shipperOrganizationId: string;
  carrierOrganizationId: string;
  tripId: string;
}

export interface VehicleLocationUpdatedEvent {
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  latitude: number;
  longitude: number;
  recordedAt: Date;
}

/**
 * In-process domain event bus. Listeners run before publish() resolves; listener errors are
 * logged and never propagate to the publisher (see @OnEvent suppressErrors default).
 */
@Injectable()
export class DomainEventPublisher {
  private readonly logger = new Logger(DomainEventPublisher.name);

  constructor(private readonly emitter: EventEmitter2) {}

  async publish(event: string, payload: object): Promise<void> {
    try {
      await this.emitter.emitAsync(event, payload);
    } catch (err) {
      this.logger.error({ err, event }, 'Domain event listener failed');
    }
  }
}

@Global()
@Module({ providers: [DomainEventPublisher], exports: [DomainEventPublisher] })
export class DomainEventsModule {}
