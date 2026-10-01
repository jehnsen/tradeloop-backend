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
import { CreateLoadDto, LoadQueryDto, UpdateLoadDto } from './dto/load.dto';
import { LoadsService } from './loads.service';

@ApiTags('Loads')
@ApiBearerAuth()
@Controller('loads')
export class LoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Post()
  @Roles(...RoleGroups.OPERATIONS)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateLoadDto) {
    return this.loads.create(ctx, dto);
  }

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: LoadQueryDto) {
    return this.loads.list(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.loads.get(ctx.organizationId, id);
  }

  @Patch(':id')
  @Roles(...RoleGroups.OPERATIONS)
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoadDto,
  ) {
    return this.loads.update(ctx, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...RoleGroups.OPERATIONS)
  cancel(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.loads.cancel(ctx, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...RoleGroups.OPERATIONS)
  remove(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.loads.remove(ctx, id);
  }
}
