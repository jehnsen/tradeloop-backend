import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthContext } from '../../common/auth/auth-context';
import { PLATFORM_ADMIN_ONLY, ROLES } from '../../common/auth/decorators';
import { Role } from '../../common/enums';
import { forbidden } from '../../common/http/app.exception';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const adminOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_ONLY, targets);
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (!adminOnly && !roles?.length) return true;

    const user = context.switchToHttp().getRequest<Request & { user?: AuthContext }>().user;
    if (!user) return true; // public route; JwtAuthGuard already decided
    if (adminOnly && !user.isPlatformAdmin) {
      throw forbidden('PLATFORM_ADMIN_REQUIRED', 'Platform administrator access required');
    }
    if (roles?.length && (!user.role || !roles.includes(user.role))) {
      throw forbidden('INSUFFICIENT_ROLE', 'Your role does not permit this action');
    }
    return true;
  }
}
