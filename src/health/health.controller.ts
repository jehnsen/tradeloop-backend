import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Public } from '../common/auth/decorators';
import { AppException } from '../common/http/app.exception';
import { InjectRedis } from '../common/redis/redis.module';

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Get()
  health() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const [postgres, redis] = await Promise.all([
      withTimeout(this.dataSource.query('SELECT 1'), 2_000).then(
        () => 'up',
        () => 'down',
      ),
      withTimeout(this.redis.ping(), 2_000).then(
        () => 'up',
        () => 'down',
      ),
    ]);
    const checks = { postgres, redis };
    if (postgres !== 'up' || redis !== 'up') {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'NOT_READY',
        'Dependencies unavailable',
        [{ field: 'checks', messages: Object.entries(checks).map(([k, v]) => `${k}: ${v}`) }],
      );
    }
    return { status: 'ok', checks };
  }
}
