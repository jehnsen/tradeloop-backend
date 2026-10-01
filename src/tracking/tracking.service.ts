import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { In, Repository } from 'typeorm';
import { AuthContext, TenantContext } from '../common/auth/auth-context';
import { AppConfig } from '../common/config/configuration';
import { Role } from '../common/enums';
import {
  DomainEventPublisher,
  DomainEvents,
  TripStatusChangedEvent,
  VehicleLocationUpdatedEvent,
} from '../common/events/domain-events';
import { haversineKm, round, toPoint } from '../common/geo/geo';
import { badRequest, forbidden, notFound } from '../common/http/app.exception';
import { Paginated } from '../common/http/pagination';
import { RealtimeEvents, RealtimePublisher, Rooms } from '../common/realtime/realtime.module';
import { InjectRedis } from '../common/redis/redis.module';
import { Driver } from '../drivers/driver.entity';
import { Location } from '../locations/location.entity';
import { BookingsService } from '../marketplace/bookings.service';
import { Trip } from '../trips/entities/trip.entity';
import { ACTIVE_STATUSES } from '../trips/trip-state';
import { Vehicle } from '../vehicles/vehicle.entity';
import { LocationUpdateDto, TrackingHistoryQueryDto } from './dto/tracking.dto';
import { LocationSource, VehicleLocation } from './vehicle-location.entity';

export interface LivePosition {
  vehicleId: string;
  tripId: string | null;
  organizationId: string;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  heading: number | null;
  accuracyMeters: number | null;
  recordedAt: string;
  source: LocationSource;
  eta?: { estimatedArrivalAt: string; remainingKm: number } | null;
}

const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const LIVE_TTL_SECONDS = 7 * 86_400;
const keys = {
  vehicle: (id: string) => `tracking:vehicle:${id}`,
  persisted: (id: string) => `tracking:persisted:${id}`,
  trip: (id: string) => `tracking:trip:${id}`,
  fleet: (orgId: string) => `tracking:fleet:${orgId}`,
};

/**
 * Live positions live in Redis (latest per vehicle/trip plus a per-organization fleet hash);
 * history goes to PostgreSQL only when the vehicle moved or enough time passed.
 */
@Injectable()
export class TrackingService {
  private readonly config: AppConfig['tracking'];

  constructor(
    @InjectRepository(VehicleLocation) private readonly history: Repository<VehicleLocation>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRedis() private readonly redis: Redis,
    private readonly bookings: BookingsService,
    private readonly realtime: RealtimePublisher,
    private readonly events: DomainEventPublisher,
    config: ConfigService<AppConfig, true>,
  ) {
    this.config = config.get('tracking', { infer: true });
  }

  async ingest(ctx: TenantContext, dto: LocationUpdateDto) {
    const vehicle = await this.vehicles.findOne({
      where: { id: dto.vehicleId, organizationId: ctx.organizationId },
    });
    if (!vehicle) throw notFound('Vehicle');
    const trip = await this.resolveTrip(ctx, dto);

    const recordedAt = dto.recordedAt ?? new Date();
    if (recordedAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
      throw badRequest('INVALID_TIMESTAMP', 'recordedAt is in the future');
    }
    const position: LivePosition = {
      vehicleId: vehicle.id,
      tripId: trip?.id ?? null,
      organizationId: ctx.organizationId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      speedKph: dto.speedKph ?? null,
      heading: dto.heading ?? null,
      accuracyMeters: dto.accuracyMeters ?? null,
      recordedAt: recordedAt.toISOString(),
      source:
        dto.source ??
        (ctx.role === Role.DRIVER ? LocationSource.DRIVER_APP : LocationSource.INTEGRATION),
    };

    const [liveRaw, persistedRaw] = await this.redis.mget(
      keys.vehicle(vehicle.id),
      keys.persisted(vehicle.id),
    );
    const live = liveRaw ? (JSON.parse(liveRaw) as LivePosition) : null;
    const isLatest = !live || new Date(live.recordedAt) <= recordedAt;
    const persist = this.shouldPersist(
      persistedRaw ? (JSON.parse(persistedRaw) as LivePosition) : null,
      position,
    );

    if (trip && isLatest) position.eta = await this.estimateArrival(trip, position);

    if (persist) {
      await this.history.insert({
        organizationId: ctx.organizationId,
        vehicleId: vehicle.id,
        tripId: position.tripId,
        latitude: position.latitude,
        longitude: position.longitude,
        location: toPoint(position.latitude, position.longitude),
        speedKph: position.speedKph,
        heading: position.heading,
        accuracyMeters: position.accuracyMeters,
        recordedAt,
        source: position.source,
      });
      if (trip && position.eta) {
        await this.trips.update(
          { id: trip.id },
          { estimatedArrivalAt: new Date(position.eta.estimatedArrivalAt) },
        );
      }
    }

    if (isLatest) {
      const json = JSON.stringify(position);
      const pipeline = this.redis
        .multi()
        .set(keys.vehicle(vehicle.id), json, 'EX', LIVE_TTL_SECONDS);
      pipeline.hset(keys.fleet(ctx.organizationId), vehicle.id, json);
      if (trip) pipeline.set(keys.trip(trip.id), json, 'EX', LIVE_TTL_SECONDS);
      if (persist) pipeline.set(keys.persisted(vehicle.id), json, 'EX', LIVE_TTL_SECONDS);
      await pipeline.exec();

      const rooms = [
        Rooms.organization(ctx.organizationId),
        ...(trip ? [Rooms.trip(trip.id)] : []),
      ];
      this.realtime.emit(rooms, RealtimeEvents.VEHICLE_LOCATION_UPDATED, position);
      if (trip && position.eta) {
        this.realtime.emit(rooms, RealtimeEvents.TRIP_ETA_UPDATED, {
          tripId: trip.id,
          ...position.eta,
        });
      }
      await this.events.publish(DomainEvents.VEHICLE_LOCATION_UPDATED, {
        organizationId: ctx.organizationId,
        vehicleId: vehicle.id,
        tripId: position.tripId,
        latitude: position.latitude,
        longitude: position.longitude,
        recordedAt,
      } satisfies VehicleLocationUpdatedEvent);
    } else if (persist) {
      await this.redis.set(
        keys.persisted(vehicle.id),
        JSON.stringify(position),
        'EX',
        LIVE_TTL_SECONDS,
      );
    }
    return { accepted: true, persisted: persist, live: isLatest, position };
  }

  async tripCurrent(ctx: AuthContext, tripId: string) {
    const trip = await this.assertTripAccess(ctx, tripId);
    const cached = await this.redis.get(keys.trip(tripId));
    let position: LivePosition | null = cached ? (JSON.parse(cached) as LivePosition) : null;
    if (!position) {
      const last = await this.history.findOne({ where: { tripId }, order: { recordedAt: 'DESC' } });
      position = last && {
        vehicleId: last.vehicleId,
        tripId,
        organizationId: last.organizationId,
        latitude: last.latitude,
        longitude: last.longitude,
        speedKph: last.speedKph,
        heading: last.heading,
        accuracyMeters: last.accuracyMeters,
        recordedAt: last.recordedAt.toISOString(),
        source: last.source,
      };
    }
    return {
      tripId,
      tripNumber: trip.tripNumber,
      status: trip.status,
      estimatedArrivalAt: position?.eta?.estimatedArrivalAt ?? trip.estimatedArrivalAt,
      position: position && this.forViewer(position, ctx),
    };
  }

  async tripHistory(ctx: AuthContext, tripId: string, query: TrackingHistoryQueryDto) {
    await this.assertTripAccess(ctx, tripId);
    const qb = this.history
      .createQueryBuilder('h')
      .select([
        'h.id',
        'h.vehicleId',
        'h.latitude',
        'h.longitude',
        'h.speedKph',
        'h.heading',
        'h.accuracyMeters',
        'h.recordedAt',
        'h.source',
      ])
      .where('h.tripId = :tripId', { tripId });
    if (query.from) qb.andWhere('h.recordedAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('h.recordedAt <= :to', { to: query.to });
    const [items, total] = await qb
      .orderBy('h.recordedAt', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return new Paginated(items, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  }

  async fleetCurrent(ctx: TenantContext) {
    const all = await this.redis.hgetall(keys.fleet(ctx.organizationId));
    const positions = Object.values(all).map((v) => JSON.parse(v) as LivePosition);
    if (!positions.length) return [];
    const vehicles = await this.vehicles.find({
      where: { id: In(positions.map((p) => p.vehicleId)), organizationId: ctx.organizationId },
      select: { id: true, plateNumber: true, vehicleType: true, status: true },
    });
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    return positions
      .filter((p) => byId.has(p.vehicleId))
      .map((p) => ({ ...p, vehicle: byId.get(p.vehicleId) }))
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }

  /** Trip owners always have access; shippers have access to trips carrying their booked loads. */
  async assertTripAccess(ctx: AuthContext, tripId: string): Promise<Trip> {
    if (!ctx.organizationId)
      throw forbidden('NO_ACTIVE_ORGANIZATION', 'Select an active organization first');
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw notFound('Trip');
    if (trip.organizationId === ctx.organizationId) return trip;
    if (await this.bookings.hasShipperAccess(ctx.organizationId, tripId)) return trip;
    throw notFound('Trip');
  }

  @OnEvent(DomainEvents.TRIP_STATUS_CHANGED)
  onTripStatusChanged(event: TripStatusChangedEvent): void {
    this.realtime.emit(
      [Rooms.organization(event.organizationId), Rooms.trip(event.tripId)],
      RealtimeEvents.TRIP_STATUS_UPDATED,
      {
        tripId: event.tripId,
        tripNumber: event.tripNumber,
        from: event.from,
        status: event.to,
        at: event.at,
      },
    );
  }

  private async resolveTrip(ctx: TenantContext, dto: LocationUpdateDto): Promise<Trip | null> {
    if (ctx.role === Role.DRIVER) {
      const driver = await this.drivers.findOne({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
      });
      if (!driver)
        throw forbidden('NOT_A_DRIVER', 'Your account is not linked to a driver profile');
      const trip = await this.trips.findOne({
        where: dto.tripId
          ? { id: dto.tripId, organizationId: ctx.organizationId }
          : {
              organizationId: ctx.organizationId,
              driverId: driver.id,
              status: In(ACTIVE_STATUSES),
            },
      });
      if (
        !trip ||
        trip.driverId !== driver.id ||
        trip.vehicleId !== dto.vehicleId ||
        !ACTIVE_STATUSES.includes(trip.status)
      ) {
        throw forbidden('NOT_ASSIGNED', 'You are not assigned to an active trip with this vehicle');
      }
      return trip;
    }
    if (dto.tripId) {
      const trip = await this.trips.findOne({
        where: { id: dto.tripId, organizationId: ctx.organizationId },
      });
      if (!trip) throw notFound('Trip');
      if (trip.vehicleId !== dto.vehicleId)
        throw badRequest('VEHICLE_MISMATCH', 'Vehicle is not assigned to this trip');
      return trip;
    }
    return this.trips.findOne({
      where: {
        organizationId: ctx.organizationId,
        vehicleId: dto.vehicleId,
        status: In(ACTIVE_STATUSES),
      },
    });
  }

  private shouldPersist(last: LivePosition | null, next: LivePosition): boolean {
    if (!last) return true;
    if (last.tripId !== next.tripId) return true;
    const movedMeters =
      haversineKm(
        { lat: last.latitude, lng: last.longitude },
        { lat: next.latitude, lng: next.longitude },
      ) * 1000;
    const elapsedSeconds =
      Math.abs(new Date(next.recordedAt).getTime() - new Date(last.recordedAt).getTime()) / 1000;
    return (
      movedMeters >= this.config.minDistanceMeters ||
      elapsedSeconds >= this.config.minIntervalSeconds
    );
  }

  /** Straight-line remaining distance scaled by a road factor; replaceable by a routing provider later. */
  private async estimateArrival(trip: Trip, position: LivePosition) {
    const destination = await this.locations.findOne({
      where: { id: trip.destinationLocationId },
      select: { id: true, latitude: true, longitude: true },
      withDeleted: true,
    });
    if (!destination) return null;
    const remainingKm =
      haversineKm(
        { lat: position.latitude, lng: position.longitude },
        { lat: destination.latitude, lng: destination.longitude },
      ) * this.config.roadFactor;
    const speed =
      position.speedKph && position.speedKph > 5 ? position.speedKph : this.config.defaultSpeedKph;
    const etaMs = new Date(position.recordedAt).getTime() + (remainingKm / speed) * 3_600_000;
    return {
      estimatedArrivalAt: new Date(etaMs).toISOString(),
      remainingKm: round(remainingKm, 1),
    };
  }

  /** Shippers tracking a booked load see the position but not the carrier's internal identifiers. */
  private forViewer(position: LivePosition, ctx: AuthContext) {
    if (position.organizationId === ctx.organizationId) return position;
    const { vehicleId: _vehicleId, organizationId: _orgId, ...shared } = position;
    return shared;
  }
}
