import { Role } from '../common/enums';
import { forbidden } from '../common/http/app.exception';
import type { ManualTripStatus, NewOrderInput, OpsData, StandingOrderInput } from './domain/types';
import type { OpsActor, OpsGuard } from './ops.service';

// Drivers act only on the trips assigned to them; customers only on their own account.

const notYours = (what: string) =>
  forbidden('NOT_YOUR_RECORD', `This ${what} is not assigned to you`);

const driverTripCheck = (data: OpsData, actor: OpsActor, tripId: string | undefined) => {
  if (actor.role !== Role.DRIVER) return;
  const trip = data.trips.find((t) => t.id === tripId);
  if (trip && trip.driverId !== actor.subjectRef) throw notYours('trip');
};

export const ownTrip =
  (tripId: string): OpsGuard =>
  (data, actor) =>
    driverTripCheck(data, actor, tripId);

export const ownDelivery =
  (deliveryId: string): OpsGuard =>
  (data, actor) =>
    driverTripCheck(data, actor, data.deliveries.find((d) => d.id === deliveryId)?.tripId);

/** Drivers start their own trip; loading, readiness and cancellation stay with dispatch. */
export const tripStatusBy =
  (tripId: string, status: ManualTripStatus): OpsGuard =>
  (data, actor) => {
    if (actor.role !== Role.DRIVER) return;
    if (status !== 'Dispatched')
      throw forbidden('DISPATCH_ONLY', 'Only dispatch can set this trip status');
    driverTripCheck(data, actor, tripId);
  };

export const ownFuelLog =
  (driverId: string, tripId?: string): OpsGuard =>
  (data, actor) => {
    if (actor.role !== Role.DRIVER) return;
    if (driverId !== actor.subjectRef) throw notYours('fuel log');
    driverTripCheck(data, actor, tripId);
  };

const customerCheck = (actor: OpsActor, customerId: string | undefined) => {
  if (actor.role === Role.CUSTOMER && customerId !== actor.subjectRef) throw notYours('account');
};

/** Portal orders: customers order for themselves, from the portal, for dispatch to confirm. */
export const portalOrder =
  (input: NewOrderInput): OpsGuard =>
  (_data, actor) => {
    if (actor.role !== Role.CUSTOMER) return;
    customerCheck(actor, input.customerId);
    if (input.source !== 'Customer Portal' || input.status !== 'Pending Confirmation')
      throw forbidden('PORTAL_ORDER', 'Portal orders are submitted for confirmation');
  };

export const ownStandingOrder =
  (input: Pick<StandingOrderInput, 'customerId' | 'id'>): OpsGuard =>
  (data, actor) => {
    customerCheck(actor, input.customerId);
    const existing = input.id ? data.standingOrders.find((s) => s.id === input.id) : undefined;
    if (existing) customerCheck(actor, existing.customerId);
  };

export const ownStandingOrderId =
  (id: string): OpsGuard =>
  (data, actor) =>
    customerCheck(actor, data.standingOrders.find((s) => s.id === id)?.customerId);

export const ownQuoteRequest =
  (customerId: string | undefined): OpsGuard =>
  (_data, actor) => {
    if (actor.role === Role.CUSTOMER) customerCheck(actor, customerId);
  };
