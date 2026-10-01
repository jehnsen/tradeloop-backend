import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DateRangeQueryDto } from '../../common/http/dto';

export class AuditQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Platform admin endpoint only; ignored for tenant queries. */
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
