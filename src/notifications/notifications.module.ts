import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceBooking } from '../marketplace/entities/marketplace-booking.entity';
import {
  InAppRealtimeChannel,
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from './notification-channel';
import { NotificationEventsListener } from './notification-events.listener';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, MarketplaceBooking])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEventsListener,
    InAppRealtimeChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [InAppRealtimeChannel],
      useFactory: (...channels: NotificationChannel[]) => channels,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
