import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { PlatformAdminOnly, Roles, Tenant } from '../common/auth/decorators';
import { RoleGroups } from '../common/enums';
import { BillingService } from './billing.service';
import { BillingSummaryQueryDto } from './dto/billing.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billing/summary')
  @Roles(...RoleGroups.FINANCE)
  summary(@Tenant() ctx: TenantContext, @Query() query: BillingSummaryQueryDto) {
    return this.billing.organizationSummary(ctx.organizationId, query);
  }

  @Get('admin/billing/summary')
  @PlatformAdminOnly()
  platformSummary(@Query() query: BillingSummaryQueryDto) {
    return this.billing.platformSummary(query);
  }
}
