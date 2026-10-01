import { Global, Injectable, Module } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';
import { InjectRedis } from '../redis/redis.module';

export const REALTIME_NAMESPACE = '/realtime';

export const Rooms = {
  organization: (id: string) => `organization:${id}`,
  trip: (id: string) => `trip:${id}`,
  user: (id: string) => `user:${id}`,
};

export const RealtimeEvents = {
  VEHICLE_LOCATION_UPDATED: 'vehicle.location.updated',
  TRIP_STATUS_UPDATED: 'trip.status.updated',
  TRIP_ETA_UPDATED: 'trip.eta.updated',
  NOTIFICATION_CREATED: 'notification.created',
} as const;

/**
 * Publishes Socket.IO events through Redis so any process (API replica or worker) can reach
 * clients connected to any API replica running the Redis adapter.
 */
@Injectable()
export class RealtimePublisher {
  private readonly emitter: Emitter;

  constructor(@InjectRedis() redis: Redis) {
    this.emitter = new Emitter(redis);
  }

  emit(rooms: string | string[], event: string, payload: unknown): void {
    this.emitter.of(REALTIME_NAMESPACE).to(rooms).emit(event, payload);
  }
}

@Global()
@Module({ providers: [RealtimePublisher], exports: [RealtimePublisher] })
export class RealtimeModule {}
