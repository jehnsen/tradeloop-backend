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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { Roles, Tenant } from '../common/auth/decorators';
import { Role, RoleGroups } from '../common/enums';
import {
  AssignLoadDto,
  CreateStopDto,
  CreateTripDto,
  ReorderStopsDto,
  TripActionDto,
  TripQueryDto,
  UpdateStopDto,
  UpdateTripDto,
} from './dto/trip.dto';
import { TripAssignmentService } from './trip-assignment.service';
import { TripStopsService } from './trip-stops.service';
import { TripsService } from './trips.service';

const DRIVER_OPS = [...RoleGroups.DISPATCH, Role.DRIVER];

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly assignments: TripAssignmentService,
    private readonly stops: TripStopsService,
  ) {}

  @Post()
  @Roles(...RoleGroups.DISPATCH)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateTripDto) {
    return this.trips.create(ctx, dto);
  }

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: TripQueryDto) {
    return this.trips.list(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.getDetail(ctx.organizationId, id);
  }

  @Patch(':id')
  @Roles(...RoleGroups.DISPATCH)
  @ApiOperation({
    summary: 'Edit a trip in DRAFT/OPEN/PLANNED. Status changes use the action endpoints.',
  })
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.trips.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...RoleGroups.DISPATCH)
  remove(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.remove(ctx, id);
  }

  @Post(':id/open')
  @HttpCode(200)
  @Roles(...RoleGroups.DISPATCH)
  open(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.open(ctx, id);
  }

  @Post(':id/plan')
  @HttpCode(200)
  @Roles(...RoleGroups.DISPATCH)
  plan(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.plan(ctx, id);
  }

  @Post(':id/dispatch')
  @HttpCode(200)
  @Roles(...RoleGroups.DISPATCH)
  dispatch(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.dispatch(ctx, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @Roles(...DRIVER_OPS)
  start(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.start(ctx, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles(...DRIVER_OPS)
  complete(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.complete(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...RoleGroups.DISPATCH)
  cancel(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TripActionDto,
  ) {
    return this.trips.cancel(ctx, id, dto.reason);
  }

  @Get(':id/loads')
  loads(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.listForTrip(ctx.organizationId, id);
  }

  @Post(':id/loads/:loadId/assign')
  @Roles(...RoleGroups.DISPATCH)
  assign(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loadId', ParseUUIDPipe) loadId: string,
    @Body() dto: AssignLoadDto,
  ) {
    return this.assignments.assign(ctx, id, loadId, dto);
  }

  @Delete(':id/loads/:loadId')
  @HttpCode(204)
  @Roles(...RoleGroups.DISPATCH)
  unassign(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loadId', ParseUUIDPipe) loadId: string,
  ) {
    return this.assignments.unassign(ctx, id, loadId);
  }

  @Get(':id/stops')
  listStops(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.stops.list(ctx, id);
  }

  @Post(':id/stops')
  @Roles(...RoleGroups.DISPATCH)
  addStop(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStopDto,
  ) {
    return this.stops.add(ctx, id, dto);
  }

  @Put(':id/stops/order')
  @Roles(...RoleGroups.DISPATCH)
  reorderStops(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderStopsDto,
  ) {
    return this.stops.reorder(ctx, id, dto.stopIds);
  }

  @Patch(':id/stops/:stopId')
  @Roles(...RoleGroups.DISPATCH)
  updateStop(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() dto: UpdateStopDto,
  ) {
    return this.stops.update(ctx, id, stopId, dto);
  }

  @Delete(':id/stops/:stopId')
  @HttpCode(204)
  @Roles(...RoleGroups.DISPATCH)
  removeStop(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.stops.remove(ctx, id, stopId);
  }

  @Post(':id/stops/:stopId/arrive')
  @HttpCode(200)
  @Roles(...DRIVER_OPS)
  arrive(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.stops.arrive(ctx, id, stopId);
  }

  @Post(':id/stops/:stopId/depart')
  @HttpCode(200)
  @Roles(...DRIVER_OPS)
  depart(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.stops.depart(ctx, id, stopId);
  }
}
