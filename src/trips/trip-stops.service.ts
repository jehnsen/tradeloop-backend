import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { badRequest, conflict, invalidTransition, notFound } from '../common/http/app.exception';
import { LocationsService } from '../locations/locations.service';
import { CreateStopDto, UpdateStopDto } from './dto/trip.dto';
import { TripLoad, TripLoadStatus } from './entities/trip-load.entity';
import { TripStop, TripStopStatus, TripStopType } from './entities/trip-stop.entity';
import { Trip, TripStatus } from './entities/trip.entity';
import { StopEffects, TripAssignmentService } from './trip-assignment.service';
import { PLANNING_STATUSES } from './trip-state';
import { TripsService } from './trips.service';

const DONE = [TripStopStatus.DEPARTED, TripStopStatus.SKIPPED];

@Injectable()
export class TripStopsService {
  constructor(
    @InjectRepository(TripStop) private readonly repo: Repository<TripStop>,
    private readonly dataSource: DataSource,
    private readonly locations: LocationsService,
    private readonly assignments: TripAssignmentService,
    private readonly trips: TripsService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, tripId: string): Promise<TripStop[]> {
    await this.trips.getOwned(ctx.organizationId, tripId);
    return this.repo.find({
      where: { tripId },
      relations: { location: true },
      order: { sequence: 'ASC' },
    });
  }

  async add(ctx: TenantContext, tripId: string, dto: CreateStopDto): Promise<TripStop> {
    return this.dataSource.transaction(async (manager) => {
      const trip = await this.lockPlanningTrip(manager, ctx, tripId);
      await this.locations.getAccessible(ctx.organizationId, dto.locationId, manager);
      return this.assignments.insertBeforeDestination(manager, trip, dto.locationId, dto.type, dto);
    });
  }

  async update(
    ctx: TenantContext,
    tripId: string,
    stopId: string,
    dto: UpdateStopDto,
  ): Promise<TripStop> {
    await this.trips.getOwned(ctx.organizationId, tripId);
    const stop = await this.getStop(this.dataSource.manager, tripId, stopId);
    if (stop.status !== TripStopStatus.PENDING)
      throw conflict('STOP_LOCKED', 'Only pending stops can be changed');
    Object.assign(stop, dto);
    return this.repo.save(stop);
  }

  async remove(ctx: TenantContext, tripId: string, stopId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockPlanningTrip(manager, ctx, tripId);
      const stop = await this.getStop(manager, tripId, stopId);
      if ([TripStopType.ORIGIN, TripStopType.DESTINATION].includes(stop.type)) {
        throw badRequest('STOP_REQUIRED', 'Origin and destination stops cannot be removed');
      }
      const referenced = await manager.getRepository(TripLoad).exists({
        where: [{ pickupStopId: stopId }, { dropoffStopId: stopId }],
      });
      if (referenced) throw conflict('STOP_IN_USE', 'Stop is referenced by load assignments');
      await manager.getRepository(TripStop).delete({ id: stopId });
    });
  }

  /** Rewrites the full stop order; origin first, destination last, every pickup before its dropoff. */
  async reorder(ctx: TenantContext, tripId: string, stopIds: string[]): Promise<TripStop[]> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockPlanningTrip(manager, ctx, tripId);
      const stops = await manager.getRepository(TripStop).find({ where: { tripId } });
      const ids = new Set(stopIds);
      if (
        ids.size !== stopIds.length ||
        stops.length !== stopIds.length ||
        stops.some((s) => !ids.has(s.id))
      ) {
        throw badRequest(
          'INVALID_STOP_ORDER',
          'stopIds must list every stop of the trip exactly once',
        );
      }
      const position = new Map(stopIds.map((id, i) => [id, i + 1]));
      const byId = new Map(stops.map((s) => [s.id, s]));
      if (
        byId.get(stopIds[0])!.type !== TripStopType.ORIGIN ||
        byId.get(stopIds.at(-1)!)!.type !== TripStopType.DESTINATION
      ) {
        throw badRequest('INVALID_STOP_ORDER', 'Origin must be first and destination last');
      }
      const tripLoads = await manager.getRepository(TripLoad).find({
        where: { tripId, status: In([TripLoadStatus.ASSIGNED, TripLoadStatus.PICKED_UP]) },
      });
      if (
        tripLoads.some((tl) => position.get(tl.pickupStopId)! >= position.get(tl.dropoffStopId)!)
      ) {
        throw badRequest(
          'INVALID_STOP_ORDER',
          'Each load must be picked up before it is dropped off',
        );
      }
      for (const stop of stops) {
        await manager
          .getRepository(TripStop)
          .update({ id: stop.id }, { sequence: position.get(stop.id)! });
      }
    });
    return this.list(ctx, tripId);
  }

  arrive(ctx: TenantContext, tripId: string, stopId: string) {
    return this.stopAction(ctx, tripId, stopId, 'arrive', async (manager, trip, stop, stops) => {
      if (stop.status !== TripStopStatus.PENDING)
        throw invalidTransition('stop', stop.status, 'arrive at');
      const blocking = stops.find((s) => s.sequence < stop.sequence && !DONE.includes(s.status));
      if (blocking)
        throw conflict('STOP_OUT_OF_ORDER', 'Previous stops must be departed or skipped first');
      stop.status = TripStopStatus.ARRIVED;
      stop.actualArrivalAt = new Date();
      await manager.getRepository(TripStop).save(stop);
      return stop.type === TripStopType.DESTINATION
        ? this.assignments.processDestinationArrival(manager, trip, stop)
        : { shipmentChanges: [], delivery: null };
    });
  }

  depart(ctx: TenantContext, tripId: string, stopId: string) {
    return this.stopAction(ctx, tripId, stopId, 'depart', async (manager, trip, stop) => {
      if (stop.type === TripStopType.DESTINATION) {
        throw conflict(
          'DESTINATION_DEPARTURE',
          'Complete the trip instead of departing the destination',
        );
      }
      if (stop.status !== TripStopStatus.ARRIVED)
        throw invalidTransition('stop', stop.status, 'depart from');
      stop.status = TripStopStatus.DEPARTED;
      stop.actualDepartureAt = new Date();
      await manager.getRepository(TripStop).save(stop);
      return this.assignments.processDeparture(manager, trip, stop);
    });
  }

  private async stopAction(
    ctx: TenantContext,
    tripId: string,
    stopId: string,
    action: 'arrive' | 'depart',
    apply: (
      manager: EntityManager,
      trip: Trip,
      stop: TripStop,
      stops: TripStop[],
    ) => Promise<StopEffects>,
  ): Promise<TripStop> {
    const { stop, effects } = await this.dataSource.transaction(async (manager) => {
      const trip = await this.assignments.lockTrip(manager, ctx.organizationId, tripId);
      await this.trips.assertActor(manager, ctx, trip);
      if (trip.status !== TripStatus.IN_PROGRESS) {
        throw conflict(
          'TRIP_NOT_IN_PROGRESS',
          `Stops can only be updated while the trip is IN_PROGRESS (current: ${trip.status})`,
        );
      }
      const stops = await manager
        .getRepository(TripStop)
        .find({ where: { tripId }, order: { sequence: 'ASC' } });
      const stop = stops.find((s) => s.id === stopId);
      if (!stop) throw notFound('Trip stop');
      const effects = await apply(manager, trip, stop, stops);
      await this.audit.record(
        {
          action: `trip.stop_${action}`,
          entityType: 'Trip',
          entityId: tripId,
          metadata: { stopId, type: stop.type },
        },
        manager,
      );
      return { stop, effects };
    });
    await this.trips.publishEffects(effects);
    return stop;
  }

  private async lockPlanningTrip(
    manager: EntityManager,
    ctx: TenantContext,
    tripId: string,
  ): Promise<Trip> {
    const trip = await this.assignments.lockTrip(manager, ctx.organizationId, tripId);
    if (!PLANNING_STATUSES.includes(trip.status))
      throw conflict('TRIP_LOCKED', `Stops cannot be changed while ${trip.status}`);
    return trip;
  }

  private async getStop(manager: EntityManager, tripId: string, stopId: string): Promise<TripStop> {
    const stop = await manager.getRepository(TripStop).findOne({ where: { id: stopId, tripId } });
    if (!stop) throw notFound('Trip stop');
    return stop;
  }
}
