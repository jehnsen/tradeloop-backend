import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RequestContext } from '../common/context/request-context';
import { paginate, Paginated } from '../common/http/pagination';
import { redact } from '../common/utils/redact';
import { AuditLog } from './audit-log.entity';
import { AuditQueryDto } from './dto/audit-query.dto';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  organizationId?: string | null;
  userId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /**
   * Records an audit entry. Pass the transaction manager to make the entry atomic with the change;
   * otherwise failures are logged and never break the calling operation.
   */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const ctx = RequestContext.get();
    const row = this.repo.create({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: redact(entry.metadata ?? {}),
      organizationId:
        entry.organizationId !== undefined ? entry.organizationId : (ctx?.organizationId ?? null),
      userId: entry.userId !== undefined ? entry.userId : (ctx?.userId ?? null),
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      requestId: ctx?.requestId ?? null,
    });
    if (manager) {
      await manager.getRepository(AuditLog).save(row);
      return;
    }
    await this.repo
      .save(row)
      .catch((err: unknown) =>
        this.logger.error({ err, action: entry.action }, 'Audit write failed'),
      );
  }

  list(query: AuditQueryDto, organizationId?: string): Promise<Paginated<AuditLog>> {
    const qb = this.repo.createQueryBuilder('a');
    const orgId = organizationId ?? query.organizationId;
    if (orgId) qb.andWhere('a.organizationId = :orgId', { orgId });
    if (query.entityType)
      qb.andWhere('a.entityType = :entityType', { entityType: query.entityType });
    if (query.entityId) qb.andWhere('a.entityId = :entityId', { entityId: query.entityId });
    if (query.action) qb.andWhere('a.action = :action', { action: query.action });
    if (query.userId) qb.andWhere('a.userId = :userId', { userId: query.userId });
    if (query.from) qb.andWhere('a.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('a.createdAt <= :to', { to: query.to });
    return paginate(qb, query, { createdAt: 'a.createdAt' }, 'createdAt');
  }
}
