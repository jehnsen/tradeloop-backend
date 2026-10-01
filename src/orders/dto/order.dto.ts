import { OmitType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DateRangeQueryDto, toDate, trim } from '../../common/http/dto';
import { OrderStatus } from '../order.entity';

export class CreateOrderDto {
  @IsUUID()
  customerId: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  externalReference?: string;

  @IsOptional()
  @toDate()
  @IsDate()
  requestedPickupAt?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  requestedDeliveryAt?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  /** Create directly in CONFIRMED status. */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class UpdateOrderDto extends PartialType(OmitType(CreateOrderDto, ['confirm'] as const)) {}

export class OrderQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalReference?: string;

  @IsOptional()
  @IsIn(['createdAt', 'requestedPickupAt', 'requestedDeliveryAt'])
  dateField?: 'createdAt' | 'requestedPickupAt' | 'requestedDeliveryAt' = 'createdAt';
}

export class CancelDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
