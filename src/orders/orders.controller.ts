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
import { CancelDto, CreateOrderDto, OrderQueryDto, UpdateOrderDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(...RoleGroups.OPERATIONS)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateOrderDto) {
    return this.orders.create(ctx, dto);
  }

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: OrderQueryDto) {
    return this.orders.list(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(ctx, id);
  }

  @Patch(':id')
  @Roles(...RoleGroups.OPERATIONS)
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.orders.update(ctx, id, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles(...RoleGroups.OPERATIONS)
  confirm(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.confirm(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...RoleGroups.OPERATIONS)
  cancel(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
  ) {
    return this.orders.cancel(ctx, id, dto.reason);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...RoleGroups.OPERATIONS)
  remove(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.remove(ctx, id);
  }
}
