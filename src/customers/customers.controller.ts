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
import { Role, RoleGroups } from '../common/enums';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CustomerQueryDto, UpdateCustomerDto } from './dto/customer.dto';

const WRITE = [...RoleGroups.OPERATIONS, Role.FINANCE];

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @Roles(...WRITE)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateCustomerDto) {
    return this.customers.create(ctx, dto);
  }

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: CustomerQueryDto) {
    return this.customers.list(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(ctx.organizationId, id);
  }

  @Patch(':id')
  @Roles(...WRITE)
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...WRITE)
  remove(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.remove(ctx, id);
  }
}
