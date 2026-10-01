import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { badRequest, notFound } from '../common/http/app.exception';
import { OrganizationPartnership } from './entities/organization-partnership.entity';
import { Organization, OrganizationStatus } from './entities/organization.entity';

@Injectable()
export class PartnershipsService {
  constructor(
    @InjectRepository(OrganizationPartnership)
    private readonly repo: Repository<OrganizationPartnership>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string) {
    const rows = await this.repo.find({
      where: { organizationId },
      relations: { partnerOrganization: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      partner: p.partnerOrganization && {
        id: p.partnerOrganization.id,
        name: p.partnerOrganization.name,
        code: p.partnerOrganization.code,
        type: p.partnerOrganization.type,
      },
    }));
  }

  async add(ctx: TenantContext, code: string) {
    const partner = await this.orgs.findOne({ where: { code, status: OrganizationStatus.ACTIVE } });
    if (!partner) throw notFound('Organization');
    if (partner.id === ctx.organizationId)
      throw badRequest('INVALID_PARTNER', 'Cannot partner with yourself');
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({ organizationId: ctx.organizationId, partnerOrganizationId: partner.id })
      .orIgnore()
      .execute();
    await this.audit.record({
      action: 'partnership.created',
      entityType: 'Organization',
      entityId: partner.id,
    });
    return {
      partnerOrganizationId: partner.id,
      name: partner.name,
      code: partner.code,
      type: partner.type,
    };
  }

  async remove(ctx: TenantContext, partnerOrganizationId: string): Promise<void> {
    const result = await this.repo.delete({
      organizationId: ctx.organizationId,
      partnerOrganizationId,
    });
    if (!result.affected) throw notFound('Partnership');
    await this.audit.record({
      action: 'partnership.removed',
      entityType: 'Organization',
      entityId: partnerOrganizationId,
    });
  }
}
