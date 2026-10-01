import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { TenantContext } from '../common/auth/auth-context';
import { notFound } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { JobNames, QueueNames } from '../queue/queue.constants';
import { NotificationQueryDto } from './dto/notification.dto';
import { NOTIFICATION_CHANNELS, NotificationChannel } from './notification-channel';
import { Notification } from './notification.entity';
import { NotifyRequest } from './notification.types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectQueue(QueueNames.NOTIFICATIONS) private readonly queue: Queue,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
    private readonly dataSource: DataSource,
  ) {}

  /** Enqueues a notification for asynchronous fan-out to organization members. */
  async notify(request: NotifyRequest): Promise<void> {
    const jobId = request.dedupeKey
      ? `notify-${createHash('sha1').update(`${request.organizationId}:${request.dedupeKey}`).digest('hex')}`
      : undefined;
    await this.queue.add(JobNames.SEND_NOTIFICATION, request, { jobId });
  }

  /** Worker side: resolves recipients, inserts idempotently, then hands new rows to channels. */
  async deliver(request: NotifyRequest): Promise<number> {
    const params: unknown[] = [request.organizationId];
    let filter = '';
    if (request.roles?.length) {
      params.push(request.roles);
      filter += ` AND m.role = ANY($${params.length}::membership_role[])`;
    }
    if (request.userIds?.length) {
      params.push(request.userIds);
      filter += ` AND m.user_id = ANY($${params.length}::uuid[])`;
    }
    const recipients: Array<{ user_id: string }> = await this.dataSource.query(
      `SELECT m.user_id FROM organization_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.status = 'ACTIVE' AND u.status = 'ACTIVE'${filter}`,
      params,
    );
    if (!recipients.length) return 0;

    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .values(
        recipients.map((r) => ({
          organizationId: request.organizationId,
          userId: r.user_id,
          type: request.type,
          title: request.title,
          message: request.message,
          data: (request.data ?? {}) as QueryDeepPartialEntity<Record<string, unknown>>,
          dedupeKey: request.dedupeKey ?? null,
        })),
      )
      .orIgnore()
      .returning([
        'id',
        'organizationId',
        'userId',
        'type',
        'title',
        'message',
        'data',
        'createdAt',
      ])
      .execute();

    const created = (result.raw as Array<Record<string, unknown>>).map((row) =>
      this.repo.create({
        id: row.id as string,
        organizationId: row.organization_id as string,
        userId: row.user_id as string,
        type: row.type as string,
        title: row.title as string,
        message: row.message as string,
        data: row.data as Record<string, unknown>,
        createdAt: row.created_at as Date,
      }),
    );
    for (const notification of created) {
      for (const channel of this.channels) {
        await channel
          .deliver(notification)
          .catch((err: unknown) =>
            this.logger.warn(
              { err, channel: channel.name, notificationId: notification.id },
              'Channel delivery failed',
            ),
          );
      }
    }
    return created.length;
  }

  async list(ctx: TenantContext, query: NotificationQueryDto) {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.userId = :userId AND n.organizationId = :org', {
        userId: ctx.userId,
        org: ctx.organizationId,
      });
    if (query.unreadOnly) qb.andWhere('n.readAt IS NULL');
    const page = await paginate(qb, query, { createdAt: 'n.createdAt' }, 'createdAt');
    page.meta.unreadCount = await this.unreadCount(ctx);
    return page;
  }

  unreadCount(ctx: TenantContext): Promise<number> {
    return this.repo.count({
      where: { userId: ctx.userId, organizationId: ctx.organizationId, readAt: IsNull() },
    });
  }

  async markRead(ctx: TenantContext, id: string): Promise<Notification> {
    const notification = await this.repo.findOne({
      where: { id, userId: ctx.userId, organizationId: ctx.organizationId },
    });
    if (!notification) throw notFound('Notification');
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.repo.update({ id }, { readAt: notification.readAt });
    }
    return notification;
  }

  async markAllRead(ctx: TenantContext): Promise<{ updated: number }> {
    const result = await this.repo.update(
      { userId: ctx.userId, organizationId: ctx.organizationId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }
}
