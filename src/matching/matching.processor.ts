import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobNames, QueueNames } from '../queue/queue.constants';
import { MatchingService } from './matching.service';

@Processor(QueueNames.MATCHING, { concurrency: 4 })
export class MatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(private readonly matching: MatchingService) {
    super();
  }

  async process(job: Job<{ postingId: string }>): Promise<number> {
    switch (job.name) {
      case JobNames.MATCH_LOAD_POSTING:
        return this.matching.refresh('load', job.data.postingId);
      case JobNames.MATCH_VEHICLE_POSTING:
        return this.matching.refresh('vehicle', job.data.postingId);
      default:
        this.logger.warn({ job: job.name }, 'Unknown matching job');
        return 0;
    }
  }
}
