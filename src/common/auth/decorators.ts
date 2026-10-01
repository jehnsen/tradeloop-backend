import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../http/app.exception';
import { Role } from '../enums';
import { AuthContext, TenantContext } from './auth-context';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const PLATFORM_ADMIN_ONLY = 'platformAdminOnly';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: readonly Role[]) => SetMetadata(ROLES, roles);
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_ONLY, true);

export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const user = ctx.switchToHttp().getRequest<Request & { user?: AuthContext }>().user;
    if (!user) throw unauthorized('UNAUTHORIZED', 'Authentication required');
    return user;
  },
);

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const user = ctx.switchToHttp().getRequest<Request & { user?: AuthContext }>().user;
  if (!user) throw unauthorized('UNAUTHORIZED', 'Authentication required');
  if (!user.organizationId || !user.role) {
    throw forbidden('NO_ACTIVE_ORGANIZATION', 'Select an active organization first');
  }
  return user as TenantContext;
});
