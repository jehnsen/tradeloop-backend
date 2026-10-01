import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AccessTokenPayload } from '../common/auth/auth-context';
import { AppConfig } from '../common/config/configuration';
import { RequestContext } from '../common/context/request-context';
import { AuthTokensDto } from './dto/auth.dto';
import { RefreshSession, SessionRevokeReason } from './entities/refresh-session.entity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

@Injectable()
export class TokenService {
  private readonly jwtConfig: AppConfig['jwt'];

  constructor(
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    config: ConfigService<AppConfig, true>,
  ) {
    this.jwtConfig = config.get('jwt', { infer: true });
  }

  /** Issues an access token plus a new refresh token stored as a SHA-256 hash. */
  async issue(
    userId: string,
    organizationId: string | null,
    options: { familyId?: string; manager?: EntityManager } = {},
  ): Promise<AuthTokensDto> {
    const ctx = RequestContext.get();
    const familyId = options.familyId ?? randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const repo = (options.manager ?? this.dataSource.manager).getRepository(RefreshSession);
    const session = await repo.save(
      repo.create({
        userId,
        organizationId,
        familyId,
        tokenHash: sha256(secret),
        expiresAt: new Date(Date.now() + this.jwtConfig.refreshTtlDays * 86_400_000),
        ipAddress: ctx?.ipAddress ?? null,
        userAgent: ctx?.userAgent ?? null,
      }),
    );
    const payload: AccessTokenPayload & { ts: number } = {
      sub: userId,
      sid: familyId,
      org: organizationId,
      ts: Date.now(),
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken: `${session.id}.${secret}`,
      tokenType: 'Bearer',
      expiresIn: this.jwtConfig.accessTtlSeconds,
      organizationId,
    };
  }

  parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
    const [sessionId, secret, ...rest] = token.split('.');
    if (rest.length || !sessionId || !secret || !UUID.test(sessionId)) return null;
    return { sessionId, secret };
  }

  async revokeFamily(
    familyId: string,
    reason: SessionRevokeReason,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.dataSource.manager)
      .getRepository(RefreshSession)
      .update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date(), revokedReason: reason });
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.dataSource.manager)
      .getRepository(RefreshSession)
      .update({ userId, revokedAt: IsNull() }, { revokedAt: new Date(), revokedReason: reason });
  }
}
