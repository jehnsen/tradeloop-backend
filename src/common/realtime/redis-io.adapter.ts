import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { AppConfig } from '../config/configuration';
import { createRedisClient } from '../redis/redis.module';

/** Socket.IO adapter backed by Redis pub/sub so rooms and emits work across API replicas and workers. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redisConfig: AppConfig['redis'],
    private readonly corsOrigins: AppConfig['corsOrigins'],
  ) {
    super(app);
  }

  connect(): void {
    const pub = createRedisClient(this.redisConfig, 'tradeloop-io-pub');
    const sub = pub.duplicate({ connectionName: 'tradeloop-io-sub' });
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins, credentials: true },
    });
    server.adapter(this.adapterConstructor);
    return server;
  }

  override async dispose(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
  }
}
