import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { MatchingModule } from './matching/matching.module';
import { MatchingProcessor } from './matching/matching.processor';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationsProcessor } from './notifications/notifications.processor';
import { MaintenanceProcessor, MaintenanceScheduler } from './queue/maintenance.processor';
import { MaintenanceService } from './queue/maintenance.service';

/** Background process: queue consumers and repeatable maintenance jobs on top of the app modules. */
@Module({
  imports: [AppModule, MatchingModule, NotificationsModule],
  providers: [
    MatchingProcessor,
    NotificationsProcessor,
    MaintenanceService,
    MaintenanceProcessor,
    MaintenanceScheduler,
  ],
})
export class WorkerModule {}
