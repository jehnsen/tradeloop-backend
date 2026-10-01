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
import { PlatformAdminOnly, Roles, Tenant } from '../common/auth/decorators';
import { RoleGroups } from '../common/enums';
import { PaginationQueryDto } from '../common/http/pagination';
import {
  AddMemberDto,
  AddPartnerDto,
  AdminCreateOrganizationDto,
  DirectoryQueryDto,
  OrganizationQueryDto,
  UpdateCommissionDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
  UpdateOrganizationStatusDto,
} from './dto/organization.dto';
import { MembershipsService } from './memberships.service';
import { OrganizationsService } from './organizations.service';
import { PartnershipsService } from './partnerships.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly memberships: MembershipsService,
    private readonly partnerships: PartnershipsService,
  ) {}

  @Get('current')
  current(@Tenant() ctx: TenantContext) {
    return this.organizations.getById(ctx.organizationId);
  }

  @Patch('current')
  @Roles(...RoleGroups.ORG_ADMIN)
  update(@Tenant() ctx: TenantContext, @Body() dto: UpdateOrganizationDto) {
    return this.organizations.updateCurrent(ctx, dto);
  }

  @Get('directory')
  directory(@Tenant() _ctx: TenantContext, @Query() query: DirectoryQueryDto) {
    return this.organizations.directory(query);
  }

  @Get('current/memberships')
  listMembers(@Tenant() ctx: TenantContext, @Query() query: PaginationQueryDto) {
    return this.memberships.list(ctx.organizationId, query);
  }

  @Post('current/memberships')
  @Roles(...RoleGroups.ORG_ADMIN)
  addMember(@Tenant() ctx: TenantContext, @Body() dto: AddMemberDto) {
    return this.memberships.add(ctx, dto);
  }

  @Patch('current/memberships/:id')
  @Roles(...RoleGroups.ORG_ADMIN)
  updateMember(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.memberships.update(ctx, id, dto);
  }

  @Delete('current/memberships/:id')
  @HttpCode(204)
  @Roles(...RoleGroups.ORG_ADMIN)
  removeMember(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.memberships.remove(ctx, id);
  }

  @Get('current/partners')
  listPartners(@Tenant() ctx: TenantContext) {
    return this.partnerships.list(ctx.organizationId);
  }

  @Post('current/partners')
  @Roles(...RoleGroups.ORG_ADMIN)
  addPartner(@Tenant() ctx: TenantContext, @Body() dto: AddPartnerDto) {
    return this.partnerships.add(ctx, dto.partnerOrganizationCode);
  }

  @Delete('current/partners/:partnerOrganizationId')
  @HttpCode(204)
  @Roles(...RoleGroups.ORG_ADMIN)
  removePartner(
    @Tenant() ctx: TenantContext,
    @Param('partnerOrganizationId', ParseUUIDPipe) id: string,
  ) {
    return this.partnerships.remove(ctx, id);
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('admin/organizations')
export class AdminOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Query() query: OrganizationQueryDto) {
    return this.organizations.list(query);
  }

  @Post()
  create(@Body() dto: AdminCreateOrganizationDto) {
    return this.organizations.adminCreate(dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.organizations.getById(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrganizationStatusDto) {
    return this.organizations.updateStatus(id, dto);
  }

  @Patch(':id/commission')
  updateCommission(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommissionDto) {
    return this.organizations.updateCommission(id, dto);
  }
}
