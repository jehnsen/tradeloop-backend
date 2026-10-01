import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toBoolean, toDate } from '../../common/http/dto';
import { PaginationQueryDto } from '../../common/http/pagination';
import { VehicleType } from '../../common/enums';
import { PostingStatus, PostingVisibility, PricingType } from '../entities/marketplace.enums';

const currency = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value));
const money = () => [
  Type(() => Number),
  IsNumber({ maxDecimalPlaces: 2 }),
  Min(0),
  Max(100_000_000),
];
const applyAll =
  (decorators: PropertyDecorator[]): PropertyDecorator =>
  (t, k) =>
    decorators.forEach((d) => d(t, k));

export class CreateVehiclePostingDto {
  /** Publish capacity from an existing trip; route, schedule and capacity default from it. */
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  originLocationId?: string;

  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @IsOptional()
  @toDate()
  @IsDate()
  departureFrom?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  departureUntil?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  availableWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000)
  availableVolumeM3?: number;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @applyAll(money())
  askingPrice?: number;

  @IsOptional()
  @currency()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsEnum(PricingType)
  pricingType?: PricingType;

  @IsOptional()
  @IsEnum(PostingVisibility)
  visibility?: PostingVisibility;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @toDate()
  @IsDate()
  expiresAt?: Date;

  /** false keeps the posting as a private DRAFT. */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateVehiclePostingDto extends PartialType(
  OmitType(CreateVehiclePostingDto, ['tripId', 'vehicleId', 'publish'] as const),
) {}

export class CreateLoadPostingDto {
  /** Publish an existing load; route, windows and cargo figures default from it and its shipment. */
  @IsOptional()
  @IsUUID()
  loadId?: string;

  @IsOptional()
  @IsUUID()
  pickupLocationId?: string;

  @IsOptional()
  @IsUUID()
  deliveryLocationId?: string;

  @IsOptional()
  @toDate()
  @IsDate()
  pickupFrom?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  pickupUntil?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000)
  volumeM3?: number;

  @IsOptional()
  @IsEnum(VehicleType)
  requiredVehicleType?: VehicleType;

  @IsOptional()
  @applyAll(money())
  budget?: number;

  @IsOptional()
  @currency()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsEnum(PostingVisibility)
  visibility?: PostingVisibility;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @toDate()
  @IsDate()
  expiresAt?: Date;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateLoadPostingDto extends PartialType(
  OmitType(CreateLoadPostingDto, ['loadId', 'publish'] as const),
) {}

class RouteFilterDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  originLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  originLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(2000)
  originRadiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  destinationLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  destinationLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(2000)
  destinationRadiusKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  originProvince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  originCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  destinationProvince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  destinationCity?: string;

  /** Window overlap filter on departure (vehicles) or pickup (loads). */
  @IsOptional()
  @toDate()
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @IsEnum(PostingStatus)
  status?: PostingStatus;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @toBoolean()
  @IsBoolean()
  includeOwn?: boolean = false;
}

export class VehiclePostingQueryDto extends RouteFilterDto {
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  /** Minimum available capacity. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minVolumeM3?: number;
}

export class LoadPostingQueryDto extends RouteFilterDto {
  /** Loads requiring this vehicle type (or no specific type). */
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  /** Loads that fit within this capacity. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxVolumeM3?: number;
}

export class MinePostingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PostingStatus)
  status?: PostingStatus;
}
