import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthContext } from '../../common/auth/auth-context';
import { IS_PUBLIC } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { unauthorized } from '../../common/http/app.exception';
import { AuthContextService } from '../auth-context.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authContext: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthContext }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw unauthorized('UNAUTHORIZED', 'Missing bearer token');
    }
    req.user = await this.authContext.fromAccessToken(token);
    RequestContext.set({ userId: req.user.userId, organizationId: req.user.organizationId });
    return true;
  }
}
