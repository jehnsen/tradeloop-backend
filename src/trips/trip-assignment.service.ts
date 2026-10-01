import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { VehicleType } from '../common/enums';
import {
  DeliveryCompletedEvent,
  DomainEventPublisher,
  DomainEvents,
  ShipmentStatusChangedEvent,
  TripLoadAssignedEvent,
} from '../common/events/domain-events';
import { badRequest, conflict, invalidTransition, notFound } from '../common/http/app.exception';
import { Driver } from '../drivers/driver.entity';
import { Load, LoadStatus } from '../loads/load.entity';
import { LocationsService } from '../locations/locations.service';
import { Shipment } from '../shipments/shipment.entity';
import { ShipmentsService } from '../shipments/shipments.service';
import { Vehicle } from '../vehicles/vehicle.entity';
import { AssignLoadDto } from './dto/trip.dto';
import { TripLoad, TripLoadStatus } from './entities/trip-load.entity';
import { TripStop, TripStopStatus, TripStopType } from './entities/trip-stop.entity';
import { Trip } from './entities/trip.entity';
import { allocateCapacity, PLANNING_STATUSES, releaseCapacity } from './trip-state';

export interface AssignLoadInput extends AssignLoadDto {
  organizationId: string;
  tripId: string;
  loadId: string;
  /** Marketplace bookings assign another tenant's load; location ownership checks are skipped. */
  crossOrganization?: boolean;
  bookingId?: string | null;
}

export interface StopEffects {
  shipmentChanges: ShipmentStatusChangedEvent[];
  delivery: DeliveryCompletedEvent | null;
}

const ACTIVE_TRIP_LOAD = [TripLoadStatus.ASSIGNED, TripLoadStatus.PICKED_UP];
const PICKUP_CAPABLE = [TripStopType.ORIGIN, TripStopType.PICKUP, TripStopType.WAYPOINT];
const DROPOFF_CAPABLE = [TripStopType.DROPOFF, TripStopType.DESTINATION, TripStopType.WAYPOINT];

@Injectable()
export class TripAssignmentService {
  constructor(
    @InjectRepository(TripLoad) private readonly tripLoads: Repository<TripLoad>,
    private readonly dataSource: DataSource,
    private readonly locations: LocationsService,
    private readonly shipments: ShipmentsService,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  async lockTrip(manager: EntityManager, organizationId: string, tripId: string): Promise<Trip> {
    const trip = await manager.getRepository(Trip).findOne({
      where: { id: tripId, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!trip) throw notFound('Trip');
    return trip;
  }

  async assign(ctx: TenantContext, tripId: string, loadId: string, dto: AssignLoadDto) {
    const result = await this.dataSource.transaction((manager) =>
      this.assignInTx(manager, { ...dto, organizationId: ctx.organizationId, tripId, loadId }),
    );
    await this.audit.record({
      action: 'trip.load_assigned',
      entityType: 'Trip',
      entityId: tripId,
      metadata: { loadId, weightKg: result.tripLoad.allocatedWeightKg },
    });
    await this.publishAssigned(result);
    return result.tripLoad;
  }

  async publishAssigned(
    result: Awaited<ReturnType<TripAssignmentService['assignInTx']>>,
  ): Promise<void> {
    await this.shipments.publishChanges(result.shipmentChanges);
    await this.events.publish(DomainEvents.TRIP_LOAD_ASSIGNED, {
      tripId: result.trip.id,
      tripNumber: result.trip.tripNumber,
      organizationId: result.trip.organizationId,
      loadId: result.load.id,
      loadOrganizationId: result.load.organizationId,
      bookingId: result.tripLoad.bookingId,
      driverUserId: result.driverUserId,
    } satisfies TripLoadAssignedEvent);
  }

  /** Allocates a load onto a trip with row locks on both, enforcing status and capacity rules. */
  async assignInTx(manager: EntityManager, input: AssignLoadInput) {
    const trip = await this.lockTrip(manager, input.organizationId, input.tripId);
    if (!PLANNING_STATUSES.includes(trip.status))
      throw invalidTransition('trip', trip.status, 'assign loads to');

    const load = await manager.getRepository(Load).findOne({
      where: input.crossOrganization
        ? { id: input.loadId }
        : { id: input.loadId, organizationId: input.organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!load) throw notFound('Load');
    if (load.status !== LoadStatus.PENDING) {
      throw conflict('LOAD_NOT_ASSIGNABLE', `Load is ${load.status} and cannot be assigned`);
    }

    const vehicle = trip.vehicleId
      ? await manager.getRepository(Vehicle).findOne({ where: { id: trip.vehicleId } })
      : null;
    if (vehicle) this.assertVehicleFits(vehicle, load);

    Object.assign(trip, allocateCapacity(trip, load.weightKg, load.volumeM3));

    const shipment = load.shipmentId
      ? await manager.getRepository(Shipment).findOne({ where: { id: load.shipmentId } })
      : null;
    const pickupStop = await this.resolveStop(
      manager,
      trip,
      'pickup',
      input.pickupStopId,
      input.pickupLocationId ?? shipment?.pickupLocationId,
      input,
    );
    const dropoffStop = await this.resolveStop(
      manager,
      trip,
      'dropoff',
      input.dropoffStopId,
      input.dropoffLocationId ?? shipment?.deliveryLocationId,
      input,
    );
    if (pickupStop.sequence >= dropoffStop.sequence) {
      throw badRequest('INVALID_STOP_ORDER', 'Pickup stop must come before the dropoff stop');
    }

    const tripLoadRepo = manager.getRepository(TripLoad);
    const tripLoad = await tripLoadRepo.save(
      tripLoadRepo.create({
        organizationId: trip.organizationId,
        tripId: trip.id,
        loadId: load.id,
        pickupStopId: pickupStop.id,
        dropoffStopId: dropoffStop.id,
        allocatedWeightKg: load.weightKg,
        allocatedVolumeM3: load.volumeM3,
        bookingId: input.bookingId ?? null,
        status: TripLoadStatus.ASSIGNED,
      }),
    );
    await manager
      .getRepository(Trip)
      .update(
        { id: trip.id },
        { availableWeightKg: trip.availableWeightKg, availableVolumeM3: trip.availableVolumeM3 },
      );
    await manager.getRepository(Load).update({ id: load.id }, { status: LoadStatus.ASSIGNED });
    load.status = LoadStatus.ASSIGNED;
    const shipmentChanges = await this.shipments.syncFromLoads(manager, [load.shipmentId]);
    const driverUserId = trip.driverId
      ? ((await manager.getRepository(Driver).findOne({ where: { id: trip.driverId } }))?.userId ??
        null)
      : null;
    return { trip, load, tripLoad, shipmentChanges, driverUserId };
  }

  async unassign(ctx: TenantContext, tripId: string, loadId: string): Promise<void> {
    const changes = await this.dataSource.transaction(async (manager) => {
      const trip = await this.lockTrip(manager, ctx.organizationId, tripId);
      if (!PLANNING_STATUSES.includes(trip.status))
        throw invalidTransition('trip', trip.status, 'remove loads from');
      const tripLoad = await manager.getRepository(TripLoad).findOne({
        where: { tripId, loadId, status: TripLoadStatus.ASSIGNED },
      });
      if (!tripLoad) throw notFound('Trip load assignment');
      if (tripLoad.bookingId) {
        throw conflict(
          'BOOKING_LINKED',
          'Load belongs to a marketplace booking; cancel the booking instead',
        );
      }
      return this.releaseInTx(manager, trip, tripLoad);
    });
    await this.audit.record({
      action: 'trip.load_unassigned',
      entityType: 'Trip',
      entityId: tripId,
      metadata: { loadId },
    });
    await this.shipments.publishChanges(changes);
  }

  /** Removes an allocation, returns its capacity and drops auto-created stops that become unused. */
  async releaseInTx(
    manager: EntityManager,
    trip: Trip,
    tripLoad: TripLoad,
  ): Promise<ShipmentStatusChangedEvent[]> {
    await manager
      .getRepository(TripLoad)
      .update({ id: tripLoad.id }, { status: TripLoadStatus.REMOVED });
    Object.assign(
      trip,
      releaseCapacity(trip, tripLoad.allocatedWeightKg, tripLoad.allocatedVolumeM3),
    );
    await manager
      .getRepository(Trip)
      .update(
        { id: trip.id },
        { availableWeightKg: trip.availableWeightKg, availableVolumeM3: trip.availableVolumeM3 },
      );
    const load = await manager
      .getRepository(Load)
      .findOne({ where: { id: tripLoad.loadId }, lock: { mode: 'pessimistic_write' } });
    if (load && load.status === LoadStatus.ASSIGNED) {
      await manager.getRepository(Load).update({ id: load.id }, { status: LoadStatus.PENDING });
    }
    for (const stopId of [tripLoad.pickupStopId, tripLoad.dropoffStopId]) {
      await this.removeStopIfUnused(manager, stopId);
    }
    return this.shipments.syncFromLoads(manager, [load?.shipmentId ?? null]);
  }

  async releaseAllInTx(
    manager: EntityManager,
    trip: Trip,
  ): Promise<{ changes: ShipmentStatusChangedEvent[]; loadIds: string[] }> {
    const active = await manager
      .getRepository(TripLoad)
      .find({ where: { tripId: trip.id, status: TripLoadStatus.ASSIGNED } });
    const changes: ShipmentStatusChangedEvent[] = [];
    for (const tl of active) changes.push(...(await this.releaseInTx(manager, trip, tl)));
    return { changes, loadIds: active.map((tl) => tl.loadId) };
  }

  listForTrip(organizationId: string, tripId: string): Promise<TripLoad[]> {
    return this.tripLoads.find({
      where: { tripId, organizationId, status: Not(TripLoadStatus.REMOVED) },
      relations: { load: true },
      order: { createdAt: 'ASC' },
    });
  }

  activeForTrip(manager: EntityManager, tripId: string): Promise<TripLoad[]> {
    return manager
      .getRepository(TripLoad)
      .find({ where: { tripId, status: In(ACTIVE_TRIP_LOAD) }, relations: { load: true } });
  }

  /** Loads leave on departure from their pickup stop and are delivered on departure from their dropoff stop. */
  async processDeparture(manager: EntityManager, trip: Trip, stop: TripStop): Promise<StopEffects> {
    const active = await this.activeForTrip(manager, trip.id);
    const picked = active.filter(
      (tl) => tl.pickupStopId === stop.id && tl.status === TripLoadStatus.ASSIGNED,
    );
    const dropped = active.filter(
      (tl) => tl.dropoffStopId === stop.id && tl.status === TripLoadStatus.PICKED_UP,
    );
    await this.setStatuses(manager, picked, TripLoadStatus.PICKED_UP, LoadStatus.IN_TRANSIT);
    await this.setStatuses(manager, dropped, TripLoadStatus.DELIVERED, LoadStatus.DELIVERED);
    return this.effects(manager, trip, stop, [...picked, ...dropped], dropped);
  }

  /** The destination has no departure, so deliveries there complete on arrival. */
  async processDestinationArrival(
    manager: EntityManager,
    trip: Trip,
    stop: TripStop,
  ): Promise<StopEffects> {
    const active = await this.activeForTrip(manager, trip.id);
    const dropped = active.filter(
      (tl) => tl.dropoffStopId === stop.id && tl.status === TripLoadStatus.PICKED_UP,
    );
    await this.setStatuses(manager, dropped, TripLoadStatus.DELIVERED, LoadStatus.DELIVERED);
    return this.effects(manager, trip, stop, dropped, dropped);
  }

  private async setStatuses(
    manager: EntityManager,
    tripLoads: TripLoad[],
    status: TripLoadStatus,
    loadStatus: LoadStatus,
  ) {
    if (!tripLoads.length) return;
    await manager
      .getRepository(TripLoad)
      .update({ id: In(tripLoads.map((t) => t.id)) }, { status });
    await manager
      .getRepository(Load)
      .update({ id: In(tripLoads.map((t) => t.loadId)) }, { status: loadStatus });
  }

  private async effects(
    manager: EntityManager,
    trip: Trip,
    stop: TripStop,
    touched: TripLoad[],
    delivered: TripLoad[],
  ): Promise<StopEffects> {
    const shipmentChanges = await this.shipments.syncFromLoads(
      manager,
      touched.map((tl) => tl.load?.shipmentId ?? null),
    );
    const delivery = delivered.length
      ? {
          tripId: trip.id,
          organizationId: trip.organizationId,
          stopId: stop.id,
          loadIds: delivered.map((tl) => tl.loadId),
          loadOrganizationIds: [...new Set(delivered.map((tl) => tl.load!.organizationId))],
        }
      : null;
    return { shipmentChanges, delivery };
  }

  private assertVehicleFits(vehicle: Vehicle, load: Load): void {
    if (load.requiredVehicleType && load.requiredVehicleType !== vehicle.vehicleType) {
      throw conflict(
        'VEHICLE_TYPE_MISMATCH',
        `Load requires a ${load.requiredVehicleType} vehicle`,
      );
    }
    if (load.temperatureControlled && vehicle.vehicleType !== VehicleType.REFRIGERATED) {
      throw conflict(
        'VEHICLE_TYPE_MISMATCH',
        'Temperature-controlled loads require a refrigerated vehicle',
      );
    }
  }

  private async resolveStop(
    manager: EntityManager,
    trip: Trip,
    kind: 'pickup' | 'dropoff',
    stopId: string | undefined,
    locationId: string | undefined,
    input: AssignLoadInput,
  ): Promise<TripStop> {
    const repo = manager.getRepository(TripStop);
    const allowed = kind === 'pickup' ? PICKUP_CAPABLE : DROPOFF_CAPABLE;
    if (stopId) {
      const stop = await repo.findOne({ where: { id: stopId, tripId: trip.id } });
      if (!stop) throw notFound('Trip stop');
      if (!allowed.includes(stop.type) || stop.status !== TripStopStatus.PENDING) {
        throw badRequest('INVALID_STOP', `Stop cannot be used as a ${kind} stop`);
      }
      return stop;
    }
    if (!locationId) {
      throw badRequest(
        'STOP_REQUIRED',
        `${kind}StopId or ${kind}LocationId is required for loads without a shipment`,
      );
    }
    if (!input.crossOrganization)
      await this.locations.getAccessible(trip.organizationId, locationId, manager);

    const anchorType = kind === 'pickup' ? TripStopType.ORIGIN : TripStopType.DESTINATION;
    const stopType = kind === 'pickup' ? TripStopType.PICKUP : TripStopType.DROPOFF;
    const candidates = await repo.find({
      where: {
        tripId: trip.id,
        locationId,
        type: In([anchorType, stopType]),
        status: TripStopStatus.PENDING,
      },
      order: { sequence: 'ASC' },
    });
    const existing = candidates.find((s) => s.type === anchorType) ?? candidates[0];
    if (existing) return existing;
    return this.insertBeforeDestination(manager, trip, locationId, stopType);
  }

  async insertBeforeDestination(
    manager: EntityManager,
    trip: Trip,
    locationId: string,
    type: TripStopType,
    planned: { plannedArrivalAt?: Date; plannedDepartureAt?: Date } = {},
  ): Promise<TripStop> {
    const repo = manager.getRepository(TripStop);
    const destination = await repo.findOne({
      where: { tripId: trip.id, type: TripStopType.DESTINATION },
    });
    if (!destination) throw conflict('TRIP_STOPS_INVALID', 'Trip has no destination stop');
    if (destination.status !== TripStopStatus.PENDING)
      throw conflict('TRIP_STOPS_LOCKED', 'Destination already reached');
    // trip_stops (trip_id, sequence) is DEFERRABLE INITIALLY DEFERRED, so shifting is safe mid-transaction.
    await repo.increment(
      { tripId: trip.id, sequence: MoreThanOrEqual(destination.sequence) },
      'sequence',
      1,
    );
    return repo.save(
      repo.create({
        organizationId: trip.organizationId,
        tripId: trip.id,
        locationId,
        type,
        sequence: destination.sequence,
        status: TripStopStatus.PENDING,
        plannedArrivalAt: planned.plannedArrivalAt ?? null,
        plannedDepartureAt: planned.plannedDepartureAt ?? null,
      }),
    );
  }

  private async removeStopIfUnused(manager: EntityManager, stopId: string): Promise<void> {
    const stop = await manager.getRepository(TripStop).findOne({ where: { id: stopId } });
    if (
      !stop ||
      ![TripStopType.PICKUP, TripStopType.DROPOFF].includes(stop.type) ||
      stop.status !== TripStopStatus.PENDING
    ) {
      return;
    }
    const inUse = await manager.getRepository(TripLoad).exists({
      where: [
        { pickupStopId: stopId, status: Not(TripLoadStatus.REMOVED) },
        { dropoffStopId: stopId, status: Not(TripLoadStatus.REMOVED) },
      ],
    });
    // Released allocations keep referencing the stop, so it is retired rather than deleted.
    if (!inUse)
      await manager
        .getRepository(TripStop)
        .update({ id: stopId }, { status: TripStopStatus.SKIPPED });
  }
}
