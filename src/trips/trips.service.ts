import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { Role } from '../common/enums';
import {
  DeliveryCompletedEvent,
  DomainEventPublisher,
  DomainEvents,
  ShipmentStatusChangedEvent,
  TripStatusChangedEvent,
} from '../common/events/domain-events';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unprocessable,
} from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { SequenceService } from '../common/sequence/sequence.service';
import { findOwnedOrFail } from '../common/utils/tenant';
import { Driver, DriverStatus } from '../drivers/driver.entity';
import { DriversService } from '../drivers/drivers.service';
import { LocationsService } from '../locations/locations.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { Vehicle, VehicleStatus } from '../vehicles/vehicle.entity';
import { VehiclesService } from '../vehicles/vehicles.service';
import { CreateTripDto, TripQueryDto, UpdateTripDto } from './dto/trip.dto';
import { TripLoad, TripLoadStatus } from './entities/trip-load.entity';
import { TripStop, TripStopStatus, TripStopType } from './entities/trip-stop.entity';
import { Trip, TripStatus } from './entities/trip.entity';
import { TripAssignmentService } from './trip-assignment.service';
import {
  ACTIVE_STATUSES,
  nextTripStatus,
  PLANNING_STATUSES,
  resizeCapacity,
  TripAction,
} from './trip-state';

export interface CreateTripInput extends CreateTripDto {
  status?: TripStatus;
}

interface TransitionEffects {
  shipmentChanges?: ShipmentStatusChangedEvent[];
  delivery?: DeliveryCompletedEvent | null;
}

const STATUS_EVENTS: Partial<Record<TripStatus, string>> = {
  [TripStatus.DISPATCHED]: DomainEvents.TRIP_DISPATCHED,
  [TripStatus.IN_PROGRESS]: DomainEvents.TRIP_STARTED,
  [TripStatus.COMPLETED]: DomainEvents.TRIP_COMPLETED,
  [TripStatus.CANCELLED]: DomainEvents.TRIP_CANCELLED,
};

const DRIVER_ACTIONS: TripAction[] = ['start', 'complete'];

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip) private readonly repo: Repository<Trip>,
    private readonly dataSource: DataSource,
    private readonly locations: LocationsService,
    private readonly vehicles: VehiclesService,
    private readonly drivers: DriversService,
    private readonly sequences: SequenceService,
    private readonly assignments: TripAssignmentService,
    private readonly shipments: ShipmentsService,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: TenantContext, dto: CreateTripDto) {
    const trip = await this.dataSource.transaction((manager) =>
      this.createInTx(manager, ctx.organizationId, dto),
    );
    await this.audit.record({
      action: 'trip.created',
      entityType: 'Trip',
      entityId: trip.id,
      metadata: { tripNumber: trip.tripNumber },
    });
    await this.events.publish(DomainEvents.TRIP_CREATED, {
      id: trip.id,
      organizationId: trip.organizationId,
    });
    return this.getDetail(ctx.organizationId, trip.id);
  }

  /** Creates a trip with ORIGIN and DESTINATION stops. Used by the API and by marketplace bookings. */
  async createInTx(
    manager: EntityManager,
    organizationId: string,
    input: CreateTripInput,
    options: { crossOrganizationLocations?: boolean } = {},
  ): Promise<Trip> {
    const vehicle = input.vehicleId
      ? await this.vehicles.get(organizationId, input.vehicleId, manager)
      : null;
    if (vehicle && [VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE].includes(vehicle.status)) {
      throw conflict('VEHICLE_UNAVAILABLE', `Vehicle is ${vehicle.status}`);
    }
    if (input.driverId)
      await this.assertDriverUsable(
        await this.drivers.get(organizationId, input.driverId, manager),
      );
    if (!options.crossOrganizationLocations) {
      await this.locations.getAccessible(organizationId, input.originLocationId, manager);
      await this.locations.getAccessible(organizationId, input.destinationLocationId, manager);
    }
    this.assertSchedule(input.scheduledDepartureAt, input.scheduledArrivalAt ?? null);

    const maxWeightKg = input.maxWeightKg ?? vehicle?.maxWeightKg;
    if (!maxWeightKg)
      throw badRequest(
        'MAX_WEIGHT_REQUIRED',
        'maxWeightKg is required when no vehicle is assigned',
      );
    const maxVolumeM3 = input.maxVolumeM3 ?? vehicle?.maxVolumeM3 ?? null;
    if (vehicle) this.assertWithinVehicle(vehicle, maxWeightKg, maxVolumeM3);

    const repo = manager.getRepository(Trip);
    const trip = await repo.save(
      repo.create({
        organizationId,
        tripNumber: await this.sequences.next('TRP', organizationId, manager),
        vehicleId: input.vehicleId ?? null,
        driverId: input.driverId ?? null,
        originLocationId: input.originLocationId,
        destinationLocationId: input.destinationLocationId,
        scheduledDepartureAt: input.scheduledDepartureAt,
        scheduledArrivalAt: input.scheduledArrivalAt ?? null,
        maxWeightKg,
        maxVolumeM3,
        availableWeightKg: maxWeightKg,
        availableVolumeM3: maxVolumeM3,
        isMarketplaceVisible: input.isMarketplaceVisible ?? false,
        notes: input.notes ?? null,
        status: input.status ?? TripStatus.DRAFT,
      }),
    );
    const stops = manager.getRepository(TripStop);
    await stops.save([
      stops.create({
        organizationId,
        tripId: trip.id,
        sequence: 1,
        locationId: trip.originLocationId,
        type: TripStopType.ORIGIN,
        plannedDepartureAt: trip.scheduledDepartureAt,
      }),
      stops.create({
        organizationId,
        tripId: trip.id,
        sequence: 2,
        locationId: trip.destinationLocationId,
        type: TripStopType.DESTINATION,
        plannedArrivalAt: trip.scheduledArrivalAt,
      }),
    ]);
    return trip;
  }

  list(ctx: TenantContext, query: TripQueryDto) {
    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoin('t.vehicle', 'v')
      .leftJoin('t.driver', 'd')
      .leftJoin('t.originLocation', 'ol')
      .leftJoin('t.destinationLocation', 'dl')
      .addSelect(['v.id', 'v.plateNumber', 'v.vehicleType', 'd.id', 'd.firstName', 'd.lastName'])
      .addSelect([
        'ol.id',
        'ol.name',
        'ol.city',
        'ol.province',
        'dl.id',
        'dl.name',
        'dl.city',
        'dl.province',
      ])
      .where('t.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.vehicleId) qb.andWhere('t.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    if (query.driverId) qb.andWhere('t.driverId = :driverId', { driverId: query.driverId });
    if (query.originLocationId)
      qb.andWhere('t.originLocationId = :o', { o: query.originLocationId });
    if (query.destinationLocationId)
      qb.andWhere('t.destinationLocationId = :d', { d: query.destinationLocationId });
    if (query.isMarketplaceVisible !== undefined)
      qb.andWhere('t.isMarketplaceVisible = :mv', { mv: query.isMarketplaceVisible });
    if (query.from) qb.andWhere('t.scheduledDepartureAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('t.scheduledDepartureAt <= :to', { to: query.to });
    if (ctx.role === Role.DRIVER) {
      qb.andWhere('d.userId = :uid', { uid: ctx.userId });
    }
    return paginate(
      qb,
      query,
      {
        scheduledDepartureAt: 't.scheduledDepartureAt',
        createdAt: 't.createdAt',
        tripNumber: 't.tripNumber',
      },
      'scheduledDepartureAt',
    );
  }

  async getDetail(organizationId: string, id: string) {
    const trip = await this.repo.findOne({
      where: { id, organizationId },
      relations: {
        vehicle: true,
        driver: true,
        originLocation: true,
        destinationLocation: true,
        stops: { location: true },
      },
      order: { stops: { sequence: 'ASC' } },
    });
    if (!trip) throw notFound('Trip');
    const loads = await this.assignments.listForTrip(organizationId, id);
    return { ...trip, loads };
  }

  async update(ctx: TenantContext, id: string, dto: UpdateTripDto) {
    await this.dataSource.transaction(async (manager) => {
      const trip = await this.assignments.lockTrip(manager, ctx.organizationId, id);
      if (!PLANNING_STATUSES.includes(trip.status))
        throw conflict('TRIP_LOCKED', `Trip cannot be edited while ${trip.status}`);

      const vehicleId = dto.vehicleId !== undefined ? dto.vehicleId : trip.vehicleId;
      const vehicle = vehicleId
        ? await this.vehicles.get(ctx.organizationId, vehicleId, manager)
        : null;
      if (dto.driverId)
        await this.assertDriverUsable(
          await this.drivers.get(ctx.organizationId, dto.driverId, manager),
        );
      if (dto.originLocationId)
        await this.locations.getAccessible(ctx.organizationId, dto.originLocationId, manager);
      if (dto.destinationLocationId)
        await this.locations.getAccessible(ctx.organizationId, dto.destinationLocationId, manager);

      const maxWeightKg = dto.maxWeightKg ?? trip.maxWeightKg;
      const maxVolumeM3 = dto.maxVolumeM3 ?? trip.maxVolumeM3;
      if (vehicle) this.assertWithinVehicle(vehicle, maxWeightKg, maxVolumeM3);
      Object.assign(trip, resizeCapacity(trip, maxWeightKg, maxVolumeM3));

      for (const key of [
        'vehicleId',
        'driverId',
        'originLocationId',
        'destinationLocationId',
        'scheduledDepartureAt',
        'scheduledArrivalAt',
        'isMarketplaceVisible',
        'notes',
      ] as const) {
        if (dto[key] !== undefined) Object.assign(trip, { [key]: dto[key] });
      }
      this.assertSchedule(trip.scheduledDepartureAt, trip.scheduledArrivalAt);
      await manager.getRepository(Trip).save(trip);

      const stops = manager.getRepository(TripStop);
      await stops.update(
        { tripId: id, type: TripStopType.ORIGIN },
        { locationId: trip.originLocationId, plannedDepartureAt: trip.scheduledDepartureAt },
      );
      await stops.update(
        { tripId: id, type: TripStopType.DESTINATION },
        { locationId: trip.destinationLocationId, plannedArrivalAt: trip.scheduledArrivalAt },
      );
    });
    await this.audit.record({
      action: 'trip.updated',
      entityType: 'Trip',
      entityId: id,
      metadata: { changes: Object.keys(dto) },
    });
    return this.getDetail(ctx.organizationId, id);
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const trip = await this.assignments.lockTrip(manager, ctx.organizationId, id);
      if (trip.status !== TripStatus.DRAFT)
        throw conflict('TRIP_NOT_DRAFT', 'Only draft trips can be deleted');
      const hasLoads = await manager
        .getRepository(TripLoad)
        .exists({ where: { tripId: id, status: Not(TripLoadStatus.REMOVED) } });
      if (hasLoads) throw conflict('TRIP_HAS_LOADS', 'Remove assigned loads first');
      await manager.getRepository(Trip).softDelete({ id });
    });
    await this.audit.record({ action: 'trip.deleted', entityType: 'Trip', entityId: id });
  }

  open(ctx: TenantContext, id: string) {
    return this.transition(ctx, id, 'open');
  }

  plan(ctx: TenantContext, id: string) {
    return this.transition(ctx, id, 'plan', async (_m, trip) => {
      if (!trip.vehicleId || !trip.driverId) {
        throw unprocessable('PLAN_REQUIREMENTS', 'Vehicle and driver are required to plan a trip');
      }
      return {};
    });
  }

  dispatch(ctx: TenantContext, id: string) {
    return this.transition(ctx, id, 'dispatch', async (manager, trip) => {
      if (!trip.vehicleId || !trip.driverId) {
        throw unprocessable('DISPATCH_REQUIREMENTS', 'Vehicle and driver are required to dispatch');
      }
      const vehicle = await manager.getRepository(Vehicle).findOne({
        where: { id: trip.vehicleId, organizationId: trip.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!vehicle) throw notFound('Vehicle');
      if (vehicle.status !== VehicleStatus.AVAILABLE)
        throw conflict('VEHICLE_UNAVAILABLE', `Vehicle is ${vehicle.status}`);
      const driver = await this.drivers.get(trip.organizationId, trip.driverId, manager);
      this.assertDriverUsable(driver);
      const driverBusy = await manager.getRepository(Trip).exists({
        where: { driverId: driver.id, status: In(ACTIVE_STATUSES), id: Not(trip.id) },
      });
      if (driverBusy) throw conflict('DRIVER_BUSY', 'Driver is already on an active trip');
      for (const tl of await this.assignments.activeForTrip(manager, trip.id)) {
        if (tl.load?.requiredVehicleType && tl.load.requiredVehicleType !== vehicle.vehicleType) {
          throw conflict(
            'VEHICLE_TYPE_MISMATCH',
            `Assigned load requires a ${tl.load.requiredVehicleType} vehicle`,
          );
        }
      }
      await manager
        .getRepository(Vehicle)
        .update({ id: vehicle.id }, { status: VehicleStatus.IN_USE });
      return {};
    });
  }

  start(ctx: TenantContext, id: string) {
    return this.transition(ctx, id, 'start', async (manager, trip) => {
      const now = new Date();
      trip.actualDepartureAt = now;
      const origin = await manager
        .getRepository(TripStop)
        .findOneOrFail({ where: { tripId: trip.id, type: TripStopType.ORIGIN } });
      Object.assign(origin, {
        status: TripStopStatus.DEPARTED,
        actualArrivalAt: origin.actualArrivalAt ?? now,
        actualDepartureAt: now,
      });
      await manager.getRepository(TripStop).save(origin);
      return this.assignments.processDeparture(manager, trip, origin);
    });
  }

  complete(ctx: TenantContext, id: string) {
    return this.transition(ctx, id, 'complete', async (manager, trip) => {
      const now = new Date();
      const stops = manager.getRepository(TripStop);
      const destination = await stops.findOneOrFail({
        where: { tripId: trip.id, type: TripStopType.DESTINATION },
      });
      let effects: TransitionEffects = {};
      if (destination.status === TripStopStatus.PENDING) {
        Object.assign(destination, { status: TripStopStatus.ARRIVED, actualArrivalAt: now });
        await stops.save(destination);
        effects = await this.assignments.processDestinationArrival(manager, trip, destination);
      }
      const undelivered = (await this.assignments.activeForTrip(manager, trip.id)).length;
      if (undelivered > 0) {
        throw conflict('UNDELIVERED_LOADS', `${undelivered} load(s) have not been delivered`);
      }
      await stops.update(
        { tripId: trip.id, status: TripStopStatus.PENDING },
        { status: TripStopStatus.SKIPPED },
      );
      trip.actualArrivalAt = now;
      trip.estimatedArrivalAt = null;
      if (trip.vehicleId)
        await manager
          .getRepository(Vehicle)
          .update({ id: trip.vehicleId }, { status: VehicleStatus.AVAILABLE });
      return effects;
    });
  }

  cancel(ctx: TenantContext, id: string, reason?: string) {
    return this.transition(
      ctx,
      id,
      'cancel',
      async (manager, trip) => {
        const wasDispatched = trip.status === TripStatus.DISPATCHED;
        const { changes } = await this.assignments.releaseAllInTx(manager, trip);
        trip.isMarketplaceVisible = false;
        if (wasDispatched && trip.vehicleId) {
          await manager
            .getRepository(Vehicle)
            .update({ id: trip.vehicleId }, { status: VehicleStatus.AVAILABLE });
        }
        return { shipmentChanges: changes };
      },
      { reason },
    );
  }

  /** Drivers may only act on trips assigned to them. */
  async assertActor(
    manager: EntityManager,
    ctx: TenantContext,
    trip: Trip,
  ): Promise<string | null> {
    const driver = trip.driverId
      ? await manager.getRepository(Driver).findOne({ where: { id: trip.driverId } })
      : null;
    if (ctx.role === Role.DRIVER && driver?.userId !== ctx.userId) {
      throw forbidden('NOT_ASSIGNED_DRIVER', 'Only the assigned driver can perform this action');
    }
    return driver?.userId ?? null;
  }

  async publishStatusChange(
    trip: Trip,
    from: TripStatus,
    driverUserId: string | null,
  ): Promise<void> {
    const event: TripStatusChangedEvent = {
      tripId: trip.id,
      organizationId: trip.organizationId,
      tripNumber: trip.tripNumber,
      from,
      to: trip.status,
      driverUserId,
      at: new Date(),
    };
    await this.events.publish(DomainEvents.TRIP_STATUS_CHANGED, event);
    const specific = STATUS_EVENTS[trip.status];
    if (specific) await this.events.publish(specific, event);
  }

  async publishEffects(effects: TransitionEffects | void): Promise<void> {
    if (!effects) return;
    await this.shipments.publishChanges(effects.shipmentChanges ?? []);
    if (effects.delivery)
      await this.events.publish(DomainEvents.DELIVERY_COMPLETED, effects.delivery);
  }

  private async transition(
    ctx: TenantContext,
    id: string,
    action: TripAction,
    apply?: (manager: EntityManager, trip: Trip) => Promise<TransitionEffects>,
    auditMetadata: Record<string, unknown> = {},
  ) {
    const { trip, from, effects, driverUserId } = await this.dataSource.transaction(
      async (manager) => {
        const trip = await this.assignments.lockTrip(manager, ctx.organizationId, id);
        const driverUserId = await this.assertActor(manager, ctx, trip);
        if (ctx.role === Role.DRIVER && !DRIVER_ACTIONS.includes(action)) {
          throw forbidden('INSUFFICIENT_ROLE', 'Drivers cannot perform this action');
        }
        const from = trip.status;
        const to = nextTripStatus(from, action);
        const effects = apply ? await apply(manager, trip) : {};
        trip.status = to;
        await manager.getRepository(Trip).save(trip);
        await this.audit.record(
          {
            action: `trip.${action}`,
            entityType: 'Trip',
            entityId: trip.id,
            metadata: { from, to, ...auditMetadata },
          },
          manager,
        );
        return { trip, from, effects, driverUserId };
      },
    );
    await this.publishEffects(effects);
    await this.publishStatusChange(trip, from, driverUserId);
    return this.getDetail(ctx.organizationId, id);
  }

  private assertDriverUsable(driver: Driver): void {
    if (driver.status !== DriverStatus.ACTIVE)
      throw conflict('DRIVER_UNAVAILABLE', `Driver is ${driver.status}`);
    if (driver.licenseExpiry && new Date(`${driver.licenseExpiry}T23:59:59Z`) < new Date()) {
      throw conflict('DRIVER_LICENSE_EXPIRED', 'Driver license has expired');
    }
  }

  private assertWithinVehicle(
    vehicle: Vehicle,
    maxWeightKg: number,
    maxVolumeM3: number | null,
  ): void {
    if (maxWeightKg > vehicle.maxWeightKg) {
      throw badRequest(
        'CAPACITY_EXCEEDS_VEHICLE',
        `maxWeightKg exceeds vehicle capacity of ${vehicle.maxWeightKg} kg`,
      );
    }
    if (maxVolumeM3 !== null && vehicle.maxVolumeM3 !== null && maxVolumeM3 > vehicle.maxVolumeM3) {
      throw badRequest(
        'CAPACITY_EXCEEDS_VEHICLE',
        `maxVolumeM3 exceeds vehicle capacity of ${vehicle.maxVolumeM3} m3`,
      );
    }
  }

  private assertSchedule(departure: Date, arrival: Date | null): void {
    if (arrival && arrival < departure) {
      throw badRequest('INVALID_SCHEDULE', 'scheduledArrivalAt must be after scheduledDepartureAt');
    }
  }

  getOwned(organizationId: string, id: string) {
    return findOwnedOrFail(this.repo, id, organizationId, 'Trip');
  }
}
