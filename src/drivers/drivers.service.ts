import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { badRequest } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { definedOnly } from '../common/utils/pick';
import { findOwnedOrFail, repoFor } from '../common/utils/tenant';
import {
  MembershipStatus,
  OrganizationMembership,
} from '../organizations/entities/organization-membership.entity';
import { Driver } from './driver.entity';
import { CreateDriverDto, DriverQueryDto, UpdateDriverDto } from './dto/driver.dto';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver) private readonly repo: Repository<Driver>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: TenantContext, dto: CreateDriverDto): Promise<Driver> {
    if (dto.userId) await this.assertMember(ctx.organizationId, dto.userId);
    const driver = await this.repo.save(
      this.repo.create({ ...dto, organizationId: ctx.organizationId }),
    );
    await this.audit.record({
      action: 'driver.created',
      entityType: 'Driver',
      entityId: driver.id,
    });
    return driver;
  }

  list(ctx: TenantContext, query: DriverQueryDto) {
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('d.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere(
        "(d.firstName || ' ' || d.lastName ILIKE :s OR d.licenseNumber ILIKE :s OR d.phone ILIKE :s)",
        {
          s: `%${query.search}%`,
        },
      );
    }
    return paginate(qb, query, { lastName: 'd.lastName', createdAt: 'd.createdAt' }, 'createdAt');
  }

  get(organizationId: string, id: string, manager?: EntityManager): Promise<Driver> {
    return findOwnedOrFail(repoFor(manager, this.repo), id, organizationId, 'Driver');
  }

  findByUser(organizationId: string, userId: string): Promise<Driver | null> {
    return this.repo.findOne({ where: { organizationId, userId } });
  }

  async update(ctx: TenantContext, id: string, dto: UpdateDriverDto): Promise<Driver> {
    const driver = await this.get(ctx.organizationId, id);
    if (dto.userId) await this.assertMember(ctx.organizationId, dto.userId);
    const saved = await this.repo.save(Object.assign(driver, definedOnly(dto)));
    await this.audit.record({
      action: 'driver.updated',
      entityType: 'Driver',
      entityId: id,
      metadata: { changes: Object.keys(definedOnly(dto)) },
    });
    return saved;
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.get(ctx.organizationId, id);
    await this.repo.softDelete({ id, organizationId: ctx.organizationId });
    await this.audit.record({ action: 'driver.deleted', entityType: 'Driver', entityId: id });
  }

  private async assertMember(organizationId: string, userId: string): Promise<void> {
    const ok = await this.memberships.exists({
      where: { organizationId, userId, status: MembershipStatus.ACTIVE },
    });
    if (!ok)
      throw badRequest(
        'INVALID_DRIVER_USER',
        'userId must reference an active member of this organization',
      );
  }
}
