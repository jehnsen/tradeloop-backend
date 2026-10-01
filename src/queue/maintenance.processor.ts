import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { MaintenanceService } from './maintenance.service';
import { JobNames, QueueNames } from './queue.constants';

const SCHEDULES: Array<{ name: string; everyMs: number }> = [
  { name: JobNames.EXPIRE_MARKETPLACE_POSTINGS, everyMs: 60_000 },
  { name: JobNames.EXPIRE_OFFERS, everyMs: 60_000 },
  { name: JobNames.CLEANUP_REFRESH_TOKENS, everyMs: 3_600_000 },
  { name: JobNames.CLEANUP_TRACKING_HISTORY, everyMs: 6 * 3_600_000 },
];

@Processor(QueueNames.MAINTENANCE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly maintenance: MaintenanceService) {
    super();
  }

  process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JobNames.EXPIRE_MARKETPLACE_POSTINGS:
        return this.maintenance.expireMarketplacePostings();
      case JobNames.EXPIRE_OFFERS:
        return this.maintenance.expireOffers();
      case JobNames.CLEANUP_REFRESH_TOKENS:
        return this.maintenance.cleanupRefreshSessions();
      case JobNames.CLEANUP_TRACKING_HISTORY:
        return this.maintenance.cleanupTrackingHistory();
      default:
        this.logger.warn({ job: job.name }, 'Unknown maintenance job');
        return Promise.resolve(null);
    }
  }
}

/**
 * Registers repeatable jobs. Job schedulers are keyed by id in Redis, so every worker replica can
 * upsert them on boot and BullMQ still produces exactly one job per interval.
 */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(QueueNames.MAINTENANCE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const schedule of SCHEDULES) {
      await this.queue.upsertJobScheduler(
        schedule.name,
        { every: schedule.everyMs },
        { name: schedule.name, opts: { attempts: 3, removeOnComplete: 100, removeOnFail: 500 } },
      );
    }
  }
}
