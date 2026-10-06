import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ExecutionContext, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BillingModule } from './billing/billing.module';
import { AuthContext } from './common/auth/auth-context';
import { AppConfigModule } from './common/config/config.module';
import { AppConfig } from './common/config/configuration';
import { DomainEventsModule } from './common/events/domain-events';
import { RealtimeModule } from './common/realtime/realtime.module';
import { REDIS, RedisModule } from './common/redis/redis.module';
import { SequenceModule } from './common/sequence/sequence.service';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { DriversModule } from './drivers/drivers.module';
import { HealthModule } from './health/health.module';
import { LoadsModule } from './loads/loads.module';
import { LocationsModule } from './locations/locations.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { MatchingModule } from './matching/matching.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OpsModule } from './ops/ops.module';
import { OrdersModule } from './orders/orders.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { QueueModule } from './queue/queue.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { TrackingModule } from './tracking/tracking.module';
import { TripsModule } from './trips/trips.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Injectable()
class HttpThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() !== 'http';
  }
}

type LoggedRequest = Request & { user?: AuthContext; id?: string };

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get('logLevel', { infer: true }),
          genReqId: (req) => (req as LoggedRequest).id ?? '',
          // Called at request start (bound to the request logger) and again on completion, when the
          // authenticated user and matched route are known.
          customProps: (req, res) => {
            const r = req as LoggedRequest;
            return res.writableEnded
              ? {
                  userId: r.user?.userId,
                  organizationId: r.user?.organizationId,
                  route: r.route?.path,
                }
              : { requestId: r.id };
          },
          serializers: {
            req: (req: { method: string; url: string }) => ({
              method: req.method,
              url: req.url.split('?')[0],
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            remove: true,
          },
          autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
          transport:
            config.get('env', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    QueueModule,
    RealtimeModule,
    EventEmitterModule.forRoot({ wildcard: false }),
    DomainEventsModule,
    SequenceModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS],
      useFactory: (config: ConfigService<AppConfig, true>, redis: Redis) => {
        const throttle = config.get('throttle', { infer: true });
        return {
          throttlers: [{ name: 'default', ttl: throttle.ttlMs, limit: throttle.limit }],
          storage: new ThrottlerStorageRedisService(redis),
        };
      },
    }),
    AuditModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    CustomersModule,
    LocationsModule,
    VehiclesModule,
    DriversModule,
    OrdersModule,
    ShipmentsModule,
    LoadsModule,
    TripsModule,
    MarketplaceModule,
    MatchingModule,
    TrackingModule,
    NotificationsModule,
    BillingModule,
    DocumentsModule,
    OpsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AppModule {}
