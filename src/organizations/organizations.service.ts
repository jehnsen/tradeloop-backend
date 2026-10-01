import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { CommissionType, OrganizationType, Role } from '../common/enums';
import { badRequest, conflict, notFound } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { definedOnly } from '../common/utils/pick';
import { UsersService } from '../users/users.service';
import {
  AdminCreateOrganizationDto,
  DirectoryQueryDto,
  OrganizationQueryDto,
  UpdateCommissionDto,
  UpdateOrganizationDto,
  UpdateOrganizationStatusDto,
} from './dto/organization.dto';
import {
  MembershipStatus,
  OrganizationMembership,
} from './entities/organization-membership.entity';
import { Organization, OrganizationStatus } from './entities/organization.entity';

export interface CreateOrganizationInput {
  name: string;
  type: OrganizationType;
  email?: string | null;
  phone?: string | null;
}

export function generateOrganizationCode(name: string): string {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 12) || 'ORG';
  return `${base}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly repo: Repository<Organization>,
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateOrganizationInput, manager: EntityManager): Promise<Organization> {
    const repo = manager.getRepository(Organization);
    return repo.save(
      repo.create({
        name: input.name,
        type: input.type,
        email: input.email ?? null,
        phone: input.phone ?? null,
        code: generateOrganizationCode(input.name),
        status: OrganizationStatus.ACTIVE,
      }),
    );
  }

  async getById(id: string): Promise<Organization> {
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw notFound('Organization');
    return org;
  }

  async updateCurrent(ctx: TenantContext, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.getById(ctx.organizationId);
    await this.repo.save(Object.assign(org, definedOnly(dto)));
    await this.audit.record({
      action: 'organization.updated',
      entityType: 'Organization',
      entityId: ctx.organizationId,
      metadata: { changes: Object.keys(definedOnly(dto)) },
    });
    return this.getById(ctx.organizationId);
  }

  /** Public directory: only identity fields of active organizations, for partner discovery. */
  directory(query: DirectoryQueryDto) {
    const qb = this.repo
      .createQueryBuilder('o')
      .select(['o.id', 'o.name', 'o.code', 'o.type', 'o.createdAt'])
      .where('o.status = :status', { status: OrganizationStatus.ACTIVE })
      .andWhere('o.type <> :admin', { admin: OrganizationType.PLATFORM_ADMIN });
    if (query.type) qb.andWhere('o.type = :type', { type: query.type });
    if (query.search)
      qb.andWhere('(o.name ILIKE :s OR o.code ILIKE :s)', { s: `%${query.search}%` });
    return paginate(qb, query, { name: 'o.name', createdAt: 'o.createdAt' }, 'name');
  }

  list(query: OrganizationQueryDto) {
    const qb = this.repo.createQueryBuilder('o');
    if (query.type) qb.andWhere('o.type = :type', { type: query.type });
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.search)
      qb.andWhere('(o.name ILIKE :s OR o.code ILIKE :s)', { s: `%${query.search}%` });
    return paginate(qb, query, { name: 'o.name', createdAt: 'o.createdAt' }, 'createdAt');
  }

  async adminCreate(dto: AdminCreateOrganizationDto): Promise<Organization> {
    const org = await this.dataSource.transaction(async (manager) => {
      const created = await this.create(dto, manager);
      let owner = await this.users.findByEmail(dto.owner.email, manager);
      owner ??= await this.users.create(dto.owner, manager);
      await manager.getRepository(OrganizationMembership).insert({
        organizationId: created.id,
        userId: owner.id,
        role: dto.type === OrganizationType.PLATFORM_ADMIN ? Role.PLATFORM_ADMIN : Role.OWNER,
        status: MembershipStatus.ACTIVE,
      });
      return created;
    });
    await this.audit.record({
      action: 'organization.created',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { name: org.name, type: org.type, ownerEmail: dto.owner.email },
    });
    return org;
  }

  async updateStatus(id: string, dto: UpdateOrganizationStatusDto): Promise<Organization> {
    const org = await this.getById(id);
    if (org.type === OrganizationType.PLATFORM_ADMIN && dto.status !== OrganizationStatus.ACTIVE) {
      throw badRequest(
        'INVALID_OPERATION',
        'Platform administration organization cannot be suspended',
      );
    }
    await this.repo.update({ id }, { status: dto.status });
    await this.audit.record({
      action: 'organization.status_changed',
      entityType: 'Organization',
      entityId: id,
      metadata: { from: org.status, to: dto.status },
    });
    return this.getById(id);
  }

  async updateCommission(id: string, dto: UpdateCommissionDto): Promise<Organization> {
    const org = await this.getById(id);
    if (dto.type === CommissionType.PERCENTAGE && (dto.value ?? 0) > 100) {
      throw badRequest('INVALID_COMMISSION', 'Percentage commission cannot exceed 100');
    }
    const value =
      dto.type === null ? null : dto.type === CommissionType.NONE ? 0 : (dto.value ?? null);
    if (dto.type !== null && value === null)
      throw badRequest('INVALID_COMMISSION', 'value is required');
    await this.repo.update({ id }, { commissionType: dto.type, commissionValue: value });
    await this.audit.record({
      action: 'commission.updated',
      entityType: 'Organization',
      entityId: id,
      organizationId: id,
      metadata: {
        from: { type: org.commissionType, value: org.commissionValue },
        to: { type: dto.type, value },
      },
    });
    return this.getById(id);
  }

  async assertActive(id: string): Promise<Organization> {
    const org = await this.getById(id);
    if (org.status !== OrganizationStatus.ACTIVE)
      throw conflict('ORGANIZATION_INACTIVE', 'Organization is not active');
    return org;
  }
}
