import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/auth/decorators';
import { RequestLookupDto, ShipperRequestDto } from './dto/ops.dto';
import { OpsService } from './ops.service';

const requestThrottle = { default: { limit: 10, ttl: 60_000 } };

/**
 * Public pages. Return trips: outside shippers browse our open return legs, request space and check
 * their request. Responses never include trip ids, plates, driver names or exact truck times.
 */
@ApiTags('Public · Return trips')
@Public()
@Controller('public/ops/:orgCode')
export class PublicOpsController {
  constructor(private readonly ops: OpsService) {}

  /** Contact details and product availability for the storefront. */
  @Get()
  storefront(@Param('orgCode') orgCode: string) {
    return this.ops.publicStorefront(orgCode);
  }

  @Get('return-trips')
  board(@Param('orgCode') orgCode: string) {
    return this.ops.publicBoard(orgCode);
  }

  @Post('return-trips/requests')
  @Throttle(requestThrottle)
  request(@Param('orgCode') orgCode: string, @Body() dto: ShipperRequestDto) {
    return this.ops.publicRequest(orgCode, dto);
  }

  /** A shipper finds their request with its number and the mobile number on it. */
  @Get('return-trips/requests/:id')
  @Throttle(requestThrottle)
  status(
    @Param('orgCode') orgCode: string,
    @Param('id') id: string,
    @Query() query: RequestLookupDto,
  ) {
    return this.ops.publicRequestStatus(orgCode, id, query.phone);
  }
}
