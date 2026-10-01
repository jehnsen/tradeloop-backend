import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AccessTokenPayload, AuthContext } from '../common/auth/auth-context';
import { OrganizationType, Role } from '../common/enums';
import { forbidden, unauthorized } from '../common/http/app.exception';
import { TokenRevocationService } from './token-revocation.service';

interface ContextRow {
  user_status: string;
  role: Role | null;
  membership_status: string | null;
  org_type: OrganizationType | null;
  org_status: string | null;
}

/** Resolves the caller's identity and active-organization membership from the database. */
@Injectable()
export class AuthContextService {
  constructor(
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly revocations: TokenRevocationService,
  ) {}

  async fromAccessToken(token: string): Promise<AuthContext> {
    let payload: AccessTokenPayload & { ts?: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw unauthorized('INVALID_TOKEN', 'Invalid or expired access token');
    }
    if (await this.revocations.isRevoked(payload)) {
      throw unauthorized('TOKEN_REVOKED', 'Session has been revoked');
    }
    return this.resolve(payload.sub, payload.sid, payload.org);
  }

  async resolve(
    userId: string,
    sessionId: string,
    organizationId: string | null,
  ): Promise<AuthContext> {
    const rows: ContextRow[] = await this.dataSource.query(
      `SELECT u.status AS user_status, m.role, m.status AS membership_status,
              o.type AS org_type, o.status AS org_status
         FROM users u
         LEFT JOIN organization_memberships m ON m.user_id = u.id AND m.organization_id = $2
         LEFT JOIN organizations o ON o.id = m.organization_id
        WHERE u.id = $1`,
      [userId, organizationId],
    );
    const row = rows[0];
    if (!row || row.user_status !== 'ACTIVE') {
      throw unauthorized('ACCOUNT_INACTIVE', 'Account is not active');
    }
    if (!organizationId) {
      return {
        userId,
        sessionId,
        organizationId: null,
        organizationType: null,
        role: null,
        isPlatformAdmin: false,
      };
    }
    if (
      row.membership_status !== 'ACTIVE' ||
      row.org_status !== 'ACTIVE' ||
      !row.role ||
      !row.org_type
    ) {
      throw forbidden(
        'ORGANIZATION_ACCESS_REVOKED',
        'No active membership in the selected organization',
      );
    }
    return {
      userId,
      sessionId,
      organizationId,
      organizationType: row.org_type,
      role: row.role,
      isPlatformAdmin:
        row.org_type === OrganizationType.PLATFORM_ADMIN && row.role === Role.PLATFORM_ADMIN,
    };
  }
}
