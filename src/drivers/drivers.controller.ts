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
import { DriversService } from './drivers.service';
import { CreateDriverDto, DriverQueryDto, UpdateDriverDto } from './dto/driver.dto';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  @Roles(...RoleGroups.FLEET)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateDriverDto) {
    return this.drivers.create(ctx, dto);
  }

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: DriverQueryDto) {
    return this.drivers.list(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.get(ctx.organizationId, id);
  }

  @Patch(':id')
  @Roles(...RoleGroups.FLEET)
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...RoleGroups.FLEET)
  remove(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.remove(ctx, id);
  }
}
