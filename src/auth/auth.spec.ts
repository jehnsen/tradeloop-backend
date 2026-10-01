import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AuthContext } from '../common/auth/auth-context';
import { PLATFORM_ADMIN_ONLY, ROLES } from '../common/auth/decorators';
import { OrganizationType, Role } from '../common/enums';
import { findOwnedOrFail } from '../common/utils/tenant';
import { AuthContextService } from './auth-context.service';
import { AuthService } from './auth.service';
import { RefreshSession, SessionRevokeReason } from './entities/refresh-session.entity';
import { RolesGuard } from './guards/roles.guard';
import { TokenRevocationService } from './token-revocation.service';
import { hashesEqual, sha256, TokenService } from './token.service';

const httpContext = (
  user: Partial<AuthContext> | undefined,
  meta: Record<string, unknown>,
): ExecutionContext =>
  ({
    getType: () => 'http',
    getHandler: () => meta,
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const reflectorFor = (meta: Record<string, unknown>) =>
  ({ getAllAndOverride: (key: string) => meta[key] }) as unknown as Reflector;

describe('refresh token format', () => {
  const tokens = new TokenService(
    {} as JwtService,
    {} as DataSource,
    {
      get: () => ({ accessTtlSeconds: 900, refreshTtlDays: 30, accessSecret: 'x' }),
    } as never,
  );

  it('parses "<sessionId>.<secret>" and rejects anything else', () => {
    const id = '0b6f3c2e-8a4d-4c1e-9f7a-2d5b6c7e8f90';
    expect(tokens.parseRefreshToken(`${id}.abc`)).toEqual({ sessionId: id, secret: 'abc' });
    expect(tokens.parseRefreshToken('not-a-uuid.abc')).toBeNull();
    expect(tokens.parseRefreshToken(`${id}`)).toBeNull();
    expect(tokens.parseRefreshToken(`${id}.a.b`)).toBeNull();
  });

  it('compares hashes in constant time', () => {
    expect(hashesEqual(sha256('secret'), sha256('secret'))).toBe(true);
    expect(hashesEqual(sha256('secret'), sha256('other'))).toBe(false);
    expect(hashesEqual(sha256('secret'), 'abcd')).toBe(false);
  });
});

describe('AuthContextService.resolve', () => {
  const make = (row: Record<string, unknown> | undefined) =>
    new AuthContextService(
      {} as JwtService,
      { query: jest.fn().mockResolvedValue(row ? [row] : []) } as never,
      {} as TokenRevocationService,
    );

  it('rejects inactive users', async () => {
    await expect(make({ user_status: 'SUSPENDED' }).resolve('u', 's', null)).rejects.toMatchObject({
      code: 'ACCOUNT_INACTIVE',
    });
    await expect(make(undefined).resolve('u', 's', null)).rejects.toMatchObject({
      code: 'ACCOUNT_INACTIVE',
    });
  });

  it('rejects a token whose organization membership is gone or suspended', async () => {
    const svc = make({
      user_status: 'ACTIVE',
      role: null,
      membership_status: null,
      org_type: null,
      org_status: null,
    });
    await expect(svc.resolve('u', 's', 'org-b')).rejects.toMatchObject({
      code: 'ORGANIZATION_ACCESS_REVOKED',
    });
    const suspended = make({
      user_status: 'ACTIVE',
      role: Role.ADMIN,
      membership_status: 'SUSPENDED',
      org_type: 'SHIPPER',
      org_status: 'ACTIVE',
    });
    await expect(suspended.resolve('u', 's', 'org-a')).rejects.toMatchObject({
      code: 'ORGANIZATION_ACCESS_REVOKED',
    });
  });

  it('derives role and platform-admin flag from the membership', async () => {
    const tenant = await make({
      user_status: 'ACTIVE',
      role: Role.DISPATCHER,
      membership_status: 'ACTIVE',
      org_type: 'TRUCKING_COMPANY',
      org_status: 'ACTIVE',
    }).resolve('u', 's', 'org-a');
    expect(tenant).toMatchObject({
      organizationId: 'org-a',
      role: Role.DISPATCHER,
      isPlatformAdmin: false,
    });
    const admin = await make({
      user_status: 'ACTIVE',
      role: Role.PLATFORM_ADMIN,
      membership_status: 'ACTIVE',
      org_type: OrganizationType.PLATFORM_ADMIN,
      org_status: 'ACTIVE',
    }).resolve('u', 's', 'org-p');
    expect(admin.isPlatformAdmin).toBe(true);
  });
});

describe('TokenRevocationService', () => {
  const svc = (family: string | null, user: string | null) =>
    new TokenRevocationService(
      { mget: jest.fn().mockResolvedValue([family, user]) } as never,
      { get: () => ({ accessTtlSeconds: 900 }) } as never,
    );

  it('revokes tokens of a logged-out session family', async () => {
    expect(await svc('1', null).isRevoked({ sub: 'u', sid: 's', org: null, ts: 1 })).toBe(true);
  });

  it('revokes tokens issued before logout-all but not after', async () => {
    expect(await svc(null, '1000').isRevoked({ sub: 'u', sid: 's', org: null, ts: 999 })).toBe(
      true,
    );
    expect(await svc(null, '1000').isRevoked({ sub: 'u', sid: 's', org: null, ts: 1001 })).toBe(
      false,
    );
    expect(await svc(null, null).isRevoked({ sub: 'u', sid: 's', org: null, ts: 1 })).toBe(false);
  });
});

describe('AuthService.refresh', () => {
  const sessionId = '0b6f3c2e-8a4d-4c1e-9f7a-2d5b6c7e8f90';

  function setup(session: Partial<RefreshSession> | null) {
    const repo = { findOne: jest.fn().mockResolvedValue(session), save: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb({ getRepository: () => repo })),
    };
    const tokens = {
      parseRefreshToken: jest.fn().mockReturnValue({ sessionId, secret: 'secret' }),
      revokeFamily: jest.fn(),
      issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    };
    const revocations = { revokeFamily: jest.fn() };
    const users = { getById: jest.fn().mockResolvedValue({ id: 'u', status: 'ACTIVE' }) };
    const memberships = {
      findActive: jest
        .fn()
        .mockResolvedValue({ organizationId: 'org', organization: { status: 'ACTIVE' } }),
      listForUser: jest.fn().mockResolvedValue([]),
    };
    const audit = { record: jest.fn() };
    const service = new AuthService(
      dataSource as never,
      users as never,
      {} as never,
      memberships as never,
      tokens as never,
      revocations as never,
      audit as never,
    );
    return { service, repo, tokens, revocations, audit };
  }

  it('rotates a valid token within the same session family', async () => {
    const { service, repo, tokens } = setup({
      id: sessionId,
      userId: 'u',
      familyId: 'fam',
      organizationId: 'org',
      tokenHash: sha256('secret'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.refresh(`${sessionId}.secret`)).resolves.toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ revokedReason: SessionRevokeReason.ROTATED }),
    );
    expect(tokens.issue).toHaveBeenCalledWith(
      'u',
      'org',
      expect.objectContaining({ familyId: 'fam' }),
    );
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const { service, tokens, revocations, audit } = setup({
      id: sessionId,
      userId: 'u',
      familyId: 'fam',
      tokenHash: sha256('secret'),
      revokedAt: new Date(),
      revokedReason: SessionRevokeReason.ROTATED,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.refresh(`${sessionId}.secret`)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam', SessionRevokeReason.REUSE_DETECTED);
    expect(revocations.revokeFamily).toHaveBeenCalledWith('fam');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.refresh_reuse_detected' }),
    );
  });

  it('rejects wrong secrets and expired sessions', async () => {
    const wrong = setup({
      id: sessionId,
      tokenHash: sha256('other'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(wrong.service.refresh(`${sessionId}.secret`)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    const expired = setup({
      id: sessionId,
      tokenHash: sha256('secret'),
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(expired.service.refresh(`${sessionId}.secret`)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(expired.tokens.issue).not.toHaveBeenCalled();
  });
});

describe('tenant authorization', () => {
  it('RolesGuard allows listed roles and rejects others', () => {
    const meta = { [ROLES]: [Role.OWNER, Role.DISPATCHER] };
    const guard = new RolesGuard(reflectorFor(meta));
    expect(guard.canActivate(httpContext({ role: Role.DISPATCHER }, meta))).toBe(true);
    expect(() => guard.canActivate(httpContext({ role: Role.VIEWER }, meta))).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_ROLE' }),
    );
    expect(() => guard.canActivate(httpContext({ role: null }, meta))).toThrow();
  });

  it('RolesGuard restricts admin endpoints to platform admins', () => {
    const meta = { [PLATFORM_ADMIN_ONLY]: true };
    const guard = new RolesGuard(reflectorFor(meta));
    expect(
      guard.canActivate(httpContext({ role: Role.PLATFORM_ADMIN, isPlatformAdmin: true }, meta)),
    ).toBe(true);
    expect(() =>
      guard.canActivate(httpContext({ role: Role.OWNER, isPlatformAdmin: false }, meta)),
    ).toThrow(expect.objectContaining({ code: 'PLATFORM_ADMIN_REQUIRED' }));
  });

  it('findOwnedOrFail always scopes by organization and hides foreign rows as NOT_FOUND', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    await expect(findOwnedOrFail(repo as never, 'id-1', 'org-a', 'Order')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-1', organizationId: 'org-a' } }),
    );
  });
});
