import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../common/http/dto';
import { PaginationQueryDto } from '../../common/http/pagination';
import { VehicleType } from '../../common/enums';
import { LoadStatus } from '../load.entity';

export class CreateLoadDto {
  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  cargoType?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  weightKg: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000)
  volumeM3?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsEnum(VehicleType)
  requiredVehicleType?: VehicleType;

  @IsOptional()
  @IsBoolean()
  temperatureControlled?: boolean;

  @IsOptional()
  @IsBoolean()
  hazardous?: boolean;
}

export class UpdateLoadDto extends PartialType(CreateLoadDto) {}

export class LoadQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LoadStatus)
  status?: LoadStatus;

  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  cargoType?: string;

  @IsOptional()
  @IsEnum(VehicleType)
  requiredVehicleType?: VehicleType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxWeightKg?: number;
}
