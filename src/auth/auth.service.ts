import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthContext } from '../common/auth/auth-context';
import { Role } from '../common/enums';
import { conflict, unauthorized } from '../common/http/app.exception';
import { verifyPassword } from '../common/utils/password';
import {
  MembershipStatus,
  OrganizationMembership,
} from '../organizations/entities/organization-membership.entity';
import { OrganizationStatus } from '../organizations/entities/organization.entity';
import { MembershipsService } from '../organizations/memberships.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthTokensDto, ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { RefreshSession, SessionRevokeReason } from './entities/refresh-session.entity';
import { TokenRevocationService } from './token-revocation.service';
import { hashesEqual, sha256, TokenService } from './token.service';

const INVALID_CREDENTIALS = () => unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
const INVALID_REFRESH = () =>
  unauthorized('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly organizations: OrganizationsService,
    private readonly memberships: MembershipsService,
    private readonly tokens: TokenService,
    private readonly revocations: TokenRevocationService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensDto> {
    if (await this.users.findByEmail(dto.email)) {
      throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
    }
    const { tokens, userId, organizationId } = await this.dataSource.transaction(
      async (manager) => {
        const user = await this.users.create(dto, manager);
        const org = await this.organizations.create(dto.organization, manager);
        await manager.getRepository(OrganizationMembership).insert({
          organizationId: org.id,
          userId: user.id,
          role: Role.OWNER,
          status: MembershipStatus.ACTIVE,
        });
        const issued = await this.tokens.issue(user.id, org.id, { manager });
        return { tokens: issued, userId: user.id, organizationId: org.id };
      },
    );
    await this.audit.record({
      action: 'auth.register',
      entityType: 'User',
      entityId: userId,
      userId,
      organizationId,
    });
    await this.audit.record({
      action: 'organization.created',
      entityType: 'Organization',
      entityId: organizationId,
      userId,
      organizationId,
      metadata: { name: dto.organization.name, type: dto.organization.type },
    });
    return tokens;
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    if (!user || !(await verifyPassword(user.passwordHash, dto.password))) {
      await this.audit.record({
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user?.id ?? null,
        userId: user?.id ?? null,
        organizationId: null,
        metadata: { email: dto.email.toLowerCase() },
      });
      throw INVALID_CREDENTIALS();
    }
    if (user.status !== UserStatus.ACTIVE)
      throw unauthorized('ACCOUNT_INACTIVE', 'Account is not active');

    const organizationId = await this.pickOrganization(user.id, dto.organizationId);
    const tokens = await this.tokens.issue(user.id, organizationId);
    await this.users.touchLogin(user.id);
    await this.audit.record({
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      organizationId,
    });
    return tokens;
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const parsed = this.tokens.parseRefreshToken(refreshToken);
    if (!parsed) throw INVALID_REFRESH();

    const outcome = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RefreshSession);
      const session = await repo.findOne({
        where: { id: parsed.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || !hashesEqual(session.tokenHash, sha256(parsed.secret)))
        return { kind: 'invalid' as const };
      if (session.revokedAt) {
        return session.revokedReason === SessionRevokeReason.ROTATED
          ? { kind: 'reuse' as const, session }
          : { kind: 'invalid' as const };
      }
      if (session.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' as const };

      const user = await this.users.getById(session.userId);
      if (user.status !== UserStatus.ACTIVE) return { kind: 'invalid' as const };

      const membership = session.organizationId
        ? await this.memberships.findActive(user.id, session.organizationId, manager)
        : null;
      const organizationId =
        membership?.organization?.status === OrganizationStatus.ACTIVE
          ? membership.organizationId
          : await this.pickOrganization(user.id);

      session.revokedAt = new Date();
      session.revokedReason = SessionRevokeReason.ROTATED;
      await repo.save(session);
      const tokens = await this.tokens.issue(user.id, organizationId, {
        familyId: session.familyId,
        manager,
      });
      return { kind: 'ok' as const, tokens };
    });

    if (outcome.kind === 'ok') return outcome.tokens;
    if (outcome.kind === 'reuse') {
      // A rotated token was presented again: assume theft and kill the whole session family.
      await this.tokens.revokeFamily(outcome.session.familyId, SessionRevokeReason.REUSE_DETECTED);
      await this.revocations.revokeFamily(outcome.session.familyId);
      await this.audit.record({
        action: 'auth.refresh_reuse_detected',
        entityType: 'User',
        entityId: outcome.session.userId,
        userId: outcome.session.userId,
        organizationId: outcome.session.organizationId,
      });
    }
    throw INVALID_REFRESH();
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.tokens.revokeFamily(auth.sessionId, SessionRevokeReason.LOGOUT);
    await this.revocations.revokeFamily(auth.sessionId);
    await this.audit.record({ action: 'auth.logout', entityType: 'User', entityId: auth.userId });
  }

  async logoutAll(auth: AuthContext): Promise<void> {
    await this.tokens.revokeAllForUser(auth.userId, SessionRevokeReason.LOGOUT_ALL);
    await this.revocations.revokeUser(auth.userId);
    await this.audit.record({
      action: 'auth.logout_all',
      entityType: 'User',
      entityId: auth.userId,
    });
  }

  async switchOrganization(auth: AuthContext, organizationId: string): Promise<AuthTokensDto> {
    const membership = await this.memberships.findActive(auth.userId, organizationId);
    if (!membership || membership.organization?.status !== OrganizationStatus.ACTIVE) {
      throw unauthorized('ORGANIZATION_ACCESS_DENIED', 'No active membership in that organization');
    }
    await this.tokens.revokeFamily(auth.sessionId, SessionRevokeReason.SWITCHED_ORGANIZATION);
    await this.revocations.revokeFamily(auth.sessionId);
    const tokens = await this.tokens.issue(auth.userId, organizationId);
    await this.audit.record({
      action: 'auth.organization_switched',
      entityType: 'User',
      entityId: auth.userId,
      organizationId,
      metadata: { from: auth.organizationId },
    });
    return tokens;
  }

  async changePassword(auth: AuthContext, dto: ChangePasswordDto): Promise<void> {
    const user = await this.users.findWithPassword(auth.userId);
    if (!user || !(await verifyPassword(user.passwordHash, dto.currentPassword)))
      throw INVALID_CREDENTIALS();
    await this.users.updatePassword(user.id, dto.newPassword);
    await this.tokens.revokeAllForUser(user.id, SessionRevokeReason.PASSWORD_CHANGED);
    await this.revocations.revokeUser(user.id);
    await this.audit.record({
      action: 'user.password_changed',
      entityType: 'User',
      entityId: user.id,
    });
  }

  async me(auth: AuthContext) {
    const [user, memberships] = await Promise.all([
      this.users.getById(auth.userId),
      this.memberships.listForUser(auth.userId),
    ]);
    return {
      user,
      activeOrganizationId: auth.organizationId,
      role: auth.role,
      isPlatformAdmin: auth.isPlatformAdmin,
      memberships: memberships
        .filter((m) => m.organization?.status === OrganizationStatus.ACTIVE)
        .map((m) => ({
          membershipId: m.id,
          role: m.role,
          subjectRef: m.subjectRef,
          organization: {
            id: m.organizationId,
            name: m.organization!.name,
            code: m.organization!.code,
            type: m.organization!.type,
          },
        })),
    };
  }

  private async pickOrganization(userId: string, preferred?: string): Promise<string | null> {
    const memberships = (await this.memberships.listForUser(userId)).filter(
      (m) => m.organization?.status === OrganizationStatus.ACTIVE,
    );
    if (preferred) {
      if (!memberships.some((m) => m.organizationId === preferred)) {
        throw unauthorized(
          'ORGANIZATION_ACCESS_DENIED',
          'No active membership in that organization',
        );
      }
      return preferred;
    }
    return memberships[0]?.organizationId ?? null;
  }
}
