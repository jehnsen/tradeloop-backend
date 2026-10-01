import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

export const REDIS = Symbol('REDIS');
export const InjectRedis = () => Inject(REDIS);

export function createRedisClient(config: AppConfig['redis'], name: string): Redis {
  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password || undefined,
    db: config.db,
    connectionName: name,
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        createRedisClient(config.get('redis', { infer: true }), 'tradeloop-app'),
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
