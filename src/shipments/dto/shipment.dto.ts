import { PartialType } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DateRangeQueryDto, toDate } from '../../common/http/dto';
import { ShipmentStatus } from '../shipment.entity';

export class CreateShipmentDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsUUID()
  pickupLocationId: string;

  @IsUUID()
  deliveryLocationId: string;

  @IsOptional()
  @toDate()
  @IsDate()
  pickupWindowStart?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  pickupWindowEnd?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  deliveryWindowStart?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  deliveryWindowEnd?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cargoDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  specialInstructions?: string;
}

export class UpdateShipmentDto extends PartialType(CreateShipmentDto) {}

export class ShipmentQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  shipmentNumber?: string;
}
