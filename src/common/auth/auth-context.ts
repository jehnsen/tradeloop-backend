import { OrganizationType, Role } from '../enums';

export interface AuthContext {
  userId: string;
  sessionId: string;
  organizationId: string | null;
  organizationType: OrganizationType | null;
  role: Role | null;
  isPlatformAdmin: boolean;
}

export interface TenantContext extends AuthContext {
  organizationId: string;
  organizationType: OrganizationType;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  org: string | null;
  iat?: number;
  exp?: number;
}
