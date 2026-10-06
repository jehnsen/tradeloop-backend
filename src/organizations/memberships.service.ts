import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { OrganizationType, Role } from '../common/enums';
import { badRequest, conflict, forbidden, notFound } from '../common/http/app.exception';
import { PaginationQueryDto, paginate } from '../common/http/pagination';
import { UsersService } from '../users/users.service';
import { AddMemberDto, UpdateMemberDto } from './dto/organization.dto';
import {
  MembershipStatus,
  OrganizationMembership,
} from './entities/organization-membership.entity';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(OrganizationMembership)
    private readonly repo: Repository<OrganizationMembership>,
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  listForUser(userId: string): Promise<OrganizationMembership[]> {
    return this.repo.find({
      where: { userId, status: MembershipStatus.ACTIVE },
      relations: { organization: true },
      order: { createdAt: 'ASC' },
    });
  }

  findActive(userId: string, organizationId: string, manager?: EntityManager) {
    return (manager?.getRepository(OrganizationMembership) ?? this.repo).findOne({
      where: { userId, organizationId, status: MembershipStatus.ACTIVE },
      relations: { organization: true },
    });
  }

  list(organizationId: string, query: PaginationQueryDto) {
    const qb = this.repo
      .createQueryBuilder('m')
      .innerJoin('m.user', 'u')
      .addSelect(['u.id', 'u.email', 'u.firstName', 'u.lastName', 'u.phone', 'u.status'])
      .where('m.organizationId = :organizationId', { organizationId });
    return paginate(qb, query, { createdAt: 'm.createdAt', role: 'm.role' }, 'createdAt');
  }

  async add(ctx: TenantContext, dto: AddMemberDto): Promise<OrganizationMembership> {
    this.assertRoleGrantable(ctx, dto.role);
    const membership = await this.dataSource.transaction(async (manager) => {
      let user = await this.users.findByEmail(dto.email, manager);
      if (!user) {
        if (!dto.firstName || !dto.lastName || !dto.password) {
          throw badRequest(
            'USER_DETAILS_REQUIRED',
            'firstName, lastName and password are required for new users',
          );
        }
        user = await this.users.create(
          {
            email: dto.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            password: dto.password,
          },
          manager,
        );
      }
      const repo = manager.getRepository(OrganizationMembership);
      const exists = await repo.exists({
        where: { organizationId: ctx.organizationId, userId: user.id },
      });
      if (exists) throw conflict('ALREADY_MEMBER', 'User is already a member of this organization');
      return repo.save(
        repo.create({
          organizationId: ctx.organizationId,
          userId: user.id,
          role: dto.role,
          status: MembershipStatus.ACTIVE,
          subjectRef: dto.subjectRef ?? null,
        }),
      );
    });
    await this.audit.record({
      action: 'membership.created',
      entityType: 'OrganizationMembership',
      entityId: membership.id,
      metadata: { userId: membership.userId, role: membership.role },
    });
    return membership;
  }

  async update(
    ctx: TenantContext,
    id: string,
    dto: UpdateMemberDto,
  ): Promise<OrganizationMembership> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OrganizationMembership);
      const membership = await repo.findOne({
        where: { id, organizationId: ctx.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership) throw notFound('Membership');
      if (dto.role) this.assertRoleGrantable(ctx, dto.role);
      if (membership.role === Role.OWNER && ctx.role !== Role.OWNER) {
        throw forbidden('OWNER_REQUIRED', 'Only owners can modify an owner membership');
      }
      const losesOwner =
        membership.role === Role.OWNER &&
        ((dto.role && dto.role !== Role.OWNER) || dto.status === MembershipStatus.SUSPENDED);
      if (losesOwner) await this.assertNotLastOwner(manager, ctx.organizationId);
      const before = {
        role: membership.role,
        status: membership.status,
        subjectRef: membership.subjectRef,
      };
      Object.assign(
        membership,
        dto.role ? { role: dto.role } : {},
        dto.status ? { status: dto.status } : {},
        dto.subjectRef !== undefined ? { subjectRef: dto.subjectRef } : {},
      );
      const saved = await repo.save(membership);
      await this.audit.record(
        {
          action: 'membership.updated',
          entityType: 'OrganizationMembership',
          entityId: id,
          metadata: { before, after: dto },
        },
        manager,
      );
      return saved;
    });
    return updated;
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OrganizationMembership);
      const membership = await repo.findOne({
        where: { id, organizationId: ctx.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership) throw notFound('Membership');
      if (membership.role === Role.OWNER) {
        if (ctx.role !== Role.OWNER)
          throw forbidden('OWNER_REQUIRED', 'Only owners can remove an owner');
        await this.assertNotLastOwner(manager, ctx.organizationId);
      }
      await repo.delete({ id });
      await this.audit.record(
        {
          action: 'membership.removed',
          entityType: 'OrganizationMembership',
          entityId: id,
          metadata: { userId: membership.userId, role: membership.role },
        },
        manager,
      );
    });
  }

  private assertRoleGrantable(ctx: TenantContext, role: Role): void {
    if (role === Role.PLATFORM_ADMIN && ctx.organizationType !== OrganizationType.PLATFORM_ADMIN) {
      throw forbidden(
        'ROLE_NOT_ASSIGNABLE',
        'PLATFORM_ADMIN can only be granted in the platform organization',
      );
    }
    if (role === Role.OWNER && ctx.role !== Role.OWNER) {
      throw forbidden('OWNER_REQUIRED', 'Only owners can grant the OWNER role');
    }
  }

  private async assertNotLastOwner(manager: EntityManager, organizationId: string): Promise<void> {
    const owners = await manager.getRepository(OrganizationMembership).count({
      where: { organizationId, role: Role.OWNER, status: MembershipStatus.ACTIVE },
    });
    if (owners <= 1)
      throw conflict('LAST_OWNER', 'An organization must keep at least one active owner');
  }
}
