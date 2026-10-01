import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueNames } from '../queue/queue.constants';
import { NotifyRequest } from './notification.types';
import { NotificationsService } from './notifications.service';

@Processor(QueueNames.NOTIFICATIONS, { concurrency: 10 })
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  process(job: Job<NotifyRequest>): Promise<number> {
    return this.notifications.deliver(job.data);
  }
}
