import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppConfig } from '../common/config/configuration';

/** Set-based, idempotent housekeeping statements; safe to re-run or retry at any time. */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async expireMarketplacePostings(): Promise<{
    vehiclePostings: number;
    loadPostings: number;
    offers: number;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const expire = (table: string) =>
        manager.query(
          `UPDATE ${table} SET status = 'EXPIRED', updated_at = now()
            WHERE status IN ('DRAFT', 'OPEN', 'MATCHED') AND expires_at IS NOT NULL AND expires_at <= now()
          RETURNING id`,
        ) as Promise<[Array<{ id: string }>, number]>;
      const [[, vehiclePostings], [, loadPostings]] = await Promise.all([
        expire('vehicle_postings'),
        expire('load_postings'),
      ]);
      const [, offers] = (await manager.query(
        `UPDATE marketplace_offers o SET status = 'EXPIRED', updated_at = now()
          WHERE o.status = 'PENDING' AND (
            EXISTS (SELECT 1 FROM vehicle_postings v WHERE v.id = o.vehicle_posting_id AND v.status = 'EXPIRED')
            OR EXISTS (SELECT 1 FROM load_postings l WHERE l.id = o.load_posting_id AND l.status = 'EXPIRED'))
        RETURNING o.id`,
      )) as [unknown[], number];
      const result = { vehiclePostings, loadPostings, offers };
      if (vehiclePostings || loadPostings || offers)
        this.logger.log(result, 'Expired marketplace postings');
      return result;
    });
  }

  async expireOffers(): Promise<number> {
    const [, count] = (await this.dataSource.query(
      `UPDATE marketplace_offers SET status = 'EXPIRED', updated_at = now()
        WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at <= now() RETURNING id`,
    )) as [unknown[], number];
    if (count) this.logger.log({ count }, 'Expired offers');
    return count;
  }

  async cleanupRefreshSessions(): Promise<{ revoked: number; deleted: number }> {
    const [, revoked] = (await this.dataSource.query(
      `UPDATE refresh_sessions SET revoked_at = now(), revoked_reason = 'EXPIRED'
        WHERE revoked_at IS NULL AND expires_at <= now() RETURNING id`,
    )) as [unknown[], number];
    const [, deleted] = (await this.dataSource.query(
      `DELETE FROM refresh_sessions
        WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days' RETURNING id`,
    )) as [unknown[], number];
    return { revoked, deleted };
  }

  /** Optional retention for GPS history (TRACKING_RETENTION_DAYS=0 disables). Deletes in bounded batches. */
  async cleanupTrackingHistory(): Promise<number> {
    const days = this.config.get('tracking', { infer: true }).retentionDays;
    if (!days) return 0;
    const [, deleted] = (await this.dataSource.query(
      `DELETE FROM vehicle_locations WHERE id IN (
         SELECT id FROM vehicle_locations WHERE recorded_at < now() - make_interval(days => $1) LIMIT 10000)
       RETURNING id`,
      [days],
    )) as [unknown[], number];
    return deleted;
  }
}
