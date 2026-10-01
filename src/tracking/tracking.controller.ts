import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { Roles, Tenant } from '../common/auth/decorators';
import { Role, RoleGroups } from '../common/enums';
import { LocationUpdateDto, TrackingHistoryQueryDto } from './dto/tracking.dto';
import { TrackingService } from './tracking.service';

@ApiTags('Tracking')
@ApiBearerAuth()
@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post('location')
  @HttpCode(202)
  @Roles(...RoleGroups.DISPATCH, Role.DRIVER)
  @ApiOperation({
    summary: 'Ingest a GPS position. Drivers may only report for their assigned active trip.',
  })
  ingest(@Tenant() ctx: TenantContext, @Body() dto: LocationUpdateDto) {
    return this.tracking.ingest(ctx, dto);
  }

  @Get('trips/:tripId/current')
  current(@Tenant() ctx: TenantContext, @Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.tracking.tripCurrent(ctx, tripId);
  }

  @Get('trips/:tripId/history')
  history(
    @Tenant() ctx: TenantContext,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Query() query: TrackingHistoryQueryDto,
  ) {
    return this.tracking.tripHistory(ctx, tripId, query);
  }

  @Get('fleet/current')
  fleet(@Tenant() ctx: TenantContext) {
    return this.tracking.fleetCurrent(ctx);
  }
}
