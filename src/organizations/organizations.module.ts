import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { OrganizationPartnership } from './entities/organization-partnership.entity';
import { Organization } from './entities/organization.entity';
import { MembershipsService } from './memberships.service';
import { AdminOrganizationsController, OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { PartnershipsService } from './partnerships.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, OrganizationMembership, OrganizationPartnership]),
    UsersModule,
  ],
  controllers: [OrganizationsController, AdminOrganizationsController],
  providers: [OrganizationsService, MembershipsService, PartnershipsService],
  exports: [OrganizationsService, MembershipsService],
})
export class OrganizationsModule {}
