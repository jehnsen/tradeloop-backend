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
import { CreateLocationDto, LocationQueryDto, UpdateLocationDto } from './dto/location.dto';
import { LocationsService } from './locations.service';

const WRITE = [...RoleGroups.DISPATCH, Role.PLATFORM_ADMIN];

@ApiTags('Locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Post()
  @Roles(...WRITE)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateLocationDto) {
    return this.locations.create(ctx, dto);
  }

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: LocationQueryDto) {
    return this.locations.list(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.locations.getAccessible(ctx.organizationId, id);
  }

  @Patch(':id')
  @Roles(...WRITE)
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locations.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...WRITE)
  remove(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.locations.remove(ctx, id);
  }
}
