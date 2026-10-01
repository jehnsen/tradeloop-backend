import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AccessTokenPayload } from '../common/auth/auth-context';
import { AppConfig } from '../common/config/configuration';
import { InjectRedis } from '../common/redis/redis.module';

/**
 * Short-lived denylist so logout takes effect immediately for already-issued access tokens.
 * Entries only need to outlive the access-token TTL.
 */
@Injectable()
export class TokenRevocationService {
  private readonly ttl: number;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    config: ConfigService<AppConfig, true>,
  ) {
    this.ttl = config.get('jwt', { infer: true }).accessTtlSeconds + 60;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.redis.set(`auth:rf:${familyId}`, '1', 'EX', this.ttl);
  }

  async revokeUser(userId: string, atMs = Date.now()): Promise<void> {
    await this.redis.set(`auth:ru:${userId}`, String(atMs), 'EX', this.ttl);
  }

  async isRevoked(payload: AccessTokenPayload & { ts?: number }): Promise<boolean> {
    const [family, user] = await this.redis.mget(
      `auth:rf:${payload.sid}`,
      `auth:ru:${payload.sub}`,
    );
    if (family) return true;
    if (user && (payload.ts ?? (payload.iat ?? 0) * 1000) <= Number(user)) return true;
    return false;
  }
}
