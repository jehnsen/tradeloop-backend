import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { Roles, Tenant } from '../common/auth/decorators';
import { RoleGroups } from '../common/enums';
import { BookingsService } from './bookings.service';
import {
  BookingQueryDto,
  CancelBookingDto,
  CounterOfferDto,
  CreateOfferDto,
  OfferQueryDto,
} from './dto/offer.dto';
import {
  CreateLoadPostingDto,
  CreateVehiclePostingDto,
  LoadPostingQueryDto,
  MinePostingQueryDto,
  UpdateLoadPostingDto,
  UpdateVehiclePostingDto,
  VehiclePostingQueryDto,
} from './dto/posting.dto';
import { LoadPostingsService } from './load-postings.service';
import { OffersService } from './offers.service';
import { VehiclePostingsService } from './vehicle-postings.service';

const WRITE = RoleGroups.COMMERCIAL;

@ApiTags('Marketplace - Trucks')
@ApiBearerAuth()
@Controller('marketplace/vehicles')
export class VehiclePostingsController {
  constructor(private readonly postings: VehiclePostingsService) {}

  @Post()
  @Roles(...WRITE)
  @ApiOperation({ summary: 'Publish available truck capacity (optionally from a trip or vehicle)' })
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateVehiclePostingDto) {
    return this.postings.create(ctx, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Browse available trucks visible to your organization' })
  browse(@Tenant() ctx: TenantContext, @Query() query: VehiclePostingQueryDto) {
    return this.postings.browse(ctx, query);
  }

  @Get('mine')
  mine(@Tenant() ctx: TenantContext, @Query() query: MinePostingQueryDto) {
    return this.postings.mine(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.postings.get(ctx, id);
  }

  @Patch(':id')
  @Roles(...WRITE)
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehiclePostingDto,
  ) {
    return this.postings.update(ctx, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Roles(...WRITE)
  publish(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.postings.publish(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...WRITE)
  cancel(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.postings.cancel(ctx, id);
  }
}

@ApiTags('Marketplace - Loads')
@ApiBearerAuth()
@Controller('marketplace/loads')
export class LoadPostingsController {
  constructor(private readonly postings: LoadPostingsService) {}

  @Post()
  @Roles(...WRITE)
  @ApiOperation({ summary: 'Publish a load for carriers (optionally from an existing load)' })
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateLoadPostingDto) {
    return this.postings.create(ctx, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Browse available loads visible to your organization' })
  browse(@Tenant() ctx: TenantContext, @Query() query: LoadPostingQueryDto) {
    return this.postings.browse(ctx, query);
  }

  @Get('mine')
  mine(@Tenant() ctx: TenantContext, @Query() query: MinePostingQueryDto) {
    return this.postings.mine(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.postings.get(ctx, id);
  }

  @Patch(':id')
  @Roles(...WRITE)
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoadPostingDto,
  ) {
    return this.postings.update(ctx, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Roles(...WRITE)
  publish(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.postings.publish(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...WRITE)
  cancel(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.postings.cancel(ctx, id);
  }
}

@ApiTags('Marketplace - Offers')
@ApiBearerAuth()
@Controller('marketplace/offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post()
  @Roles(...WRITE)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateOfferDto) {
    return this.offers.create(ctx, dto);
  }

  @Get('received')
  received(@Tenant() ctx: TenantContext, @Query() query: OfferQueryDto) {
    return this.offers.listReceived(ctx, query);
  }

  @Get('sent')
  sent(@Tenant() ctx: TenantContext, @Query() query: OfferQueryDto) {
    return this.offers.listSent(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.get(ctx, id);
  }

  @Post(':id/counter')
  @Roles(...WRITE)
  counter(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CounterOfferDto,
  ) {
    return this.offers.counter(ctx, id, dto);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @Roles(...WRITE)
  @ApiOperation({
    summary:
      'Accept an offer: creates the booking and assigns the load to the carrier trip atomically',
  })
  accept(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.accept(ctx, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(...WRITE)
  reject(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.reject(ctx, id);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @Roles(...WRITE)
  withdraw(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.withdraw(ctx, id);
  }
}

@ApiTags('Marketplace - Bookings')
@ApiBearerAuth()
@Controller('marketplace/bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: BookingQueryDto) {
    return this.bookings.list(ctx, query);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.get(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...WRITE)
  cancel(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.cancel(ctx, id, dto.reason);
  }
}
