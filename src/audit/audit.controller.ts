import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { PlatformAdminOnly, Roles, Tenant } from '../common/auth/decorators';
import { RoleGroups } from '../common/enums';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('audit-logs')
  @Roles(...RoleGroups.AUDIT)
  list(@Tenant() ctx: TenantContext, @Query() query: AuditQueryDto) {
    return this.audit.list(query, ctx.organizationId);
  }

  @Get('admin/audit-logs')
  @PlatformAdminOnly()
  listAll(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
