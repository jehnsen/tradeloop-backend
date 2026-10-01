import { Injectable } from '@nestjs/common';
import { RealtimeEvents, RealtimePublisher, Rooms } from '../common/realtime/realtime.module';
import { Notification } from './notification.entity';

/** Delivery adapter. Email/SMS/push providers implement this and register under NOTIFICATION_CHANNELS. */
export interface NotificationChannel {
  readonly name: string;
  deliver(notification: Notification): Promise<void>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

@Injectable()
export class InAppRealtimeChannel implements NotificationChannel {
  readonly name = 'in-app';

  constructor(private readonly realtime: RealtimePublisher) {}

  async deliver(notification: Notification): Promise<void> {
    this.realtime.emit(Rooms.user(notification.userId), RealtimeEvents.NOTIFICATION_CREATED, {
      id: notification.id,
      organizationId: notification.organizationId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      createdAt: notification.createdAt,
    });
  }
}
