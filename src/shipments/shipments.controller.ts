import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { Roles, Tenant } from '../common/auth/decorators';
import { RoleGroups } from '../common/enums';
import { CancelDto } from '../orders/dto/order.dto';
import { CreateShipmentDto, ShipmentQueryDto, UpdateShipmentDto } from './dto/shipment.dto';
import { ShipmentsService } from './shipments.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post()
  @Roles(...RoleGroups.OPERATIONS)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateShipmentDto) {
    return this.shipments.create(ctx, dto);
  }

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: ShipmentQueryDto) {
    return this.shipments.list(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.get(ctx.organizationId, id);
  }

  @Patch(':id')
  @Roles(...RoleGroups.OPERATIONS)
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShipmentDto,
  ) {
    return this.shipments.update(ctx, id, dto);
  }

  @Post(':id/plan')
  @HttpCode(200)
  @Roles(...RoleGroups.OPERATIONS)
  plan(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.plan(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...RoleGroups.OPERATIONS)
  cancel(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
  ) {
    return this.shipments.cancel(ctx, id, dto.reason);
  }

  @Post(':id/fail')
  @HttpCode(200)
  @Roles(...RoleGroups.OPERATIONS)
  fail(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
  ) {
    return this.shipments.fail(ctx, id, dto.reason);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...RoleGroups.OPERATIONS)
  remove(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.remove(ctx, id);
  }
}
