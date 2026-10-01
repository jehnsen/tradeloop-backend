import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { Tenant } from '../common/auth/decorators';
import { badRequest } from '../common/http/app.exception';
import { MatchingService } from './matching.service';

const limitOf = (limit: number) => {
  if (limit < 1 || limit > 100)
    throw badRequest('INVALID_LIMIT', 'limit must be between 1 and 100');
  return limit;
};

@ApiTags('Matching')
@ApiBearerAuth()
@Controller('matching')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get('load/:postingId/trucks')
  @ApiOperation({
    summary: 'Compatible truck postings for one of your load postings, best score first',
  })
  @ApiQuery({ name: 'limit', required: false })
  trucksForLoad(
    @Tenant() ctx: TenantContext,
    @Param('postingId', ParseUUIDPipe) postingId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.matching.trucksForLoad(ctx, postingId, limitOf(limit));
  }

  @Get('truck/:postingId/loads')
  @ApiOperation({
    summary: 'Compatible load postings for one of your truck postings, best score first',
  })
  @ApiQuery({ name: 'limit', required: false })
  loadsForTruck(
    @Tenant() ctx: TenantContext,
    @Param('postingId', ParseUUIDPipe) postingId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.matching.loadsForTruck(ctx, postingId, limitOf(limit));
  }
}
