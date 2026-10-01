import { IsBoolean, IsOptional } from 'class-validator';
import { toBoolean } from '../../common/http/dto';
import { PaginationQueryDto } from '../../common/http/pagination';

export class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  unreadOnly?: boolean;
}
