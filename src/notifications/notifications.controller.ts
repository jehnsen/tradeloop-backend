import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { Tenant } from '../common/auth/decorators';
import { NotificationQueryDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: NotificationQueryDto) {
    return this.notifications.list(ctx, query);
  }

  @Get('unread-count')
  async unreadCount(@Tenant() ctx: TenantContext) {
    return { unreadCount: await this.notifications.unreadCount(ctx) };
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@Tenant() ctx: TenantContext) {
    return this.notifications.markAllRead(ctx);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(ctx, id);
  }
}
