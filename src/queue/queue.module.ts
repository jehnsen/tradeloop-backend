import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config/configuration';
import { QueueNames } from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const redis = config.get('redis', { infer: true });
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password || undefined,
            db: redis.db,
          },
          prefix: config.get('queuePrefix', { infer: true }),
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { age: 3_600, count: 1_000 },
            removeOnFail: { age: 7 * 86_400 },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QueueNames.MATCHING },
      { name: QueueNames.NOTIFICATIONS },
      { name: QueueNames.MAINTENANCE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
