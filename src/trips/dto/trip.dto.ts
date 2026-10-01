import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import { DateRangeQueryDto, toBoolean, toDate } from '../../common/http/dto';
import { TripStopType } from '../entities/trip-stop.entity';
import { TripStatus } from '../entities/trip.entity';

export class CreateTripDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsUUID()
  originLocationId: string;

  @IsUUID()
  destinationLocationId: string;

  @toDate()
  @IsDate()
  scheduledDepartureAt: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  scheduledArrivalAt?: Date;

  /** Defaults to the vehicle's maximum; required when no vehicle is set. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  maxWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000)
  maxVolumeM3?: number;

  @IsOptional()
  @IsBoolean()
  isMarketplaceVisible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateTripDto extends PartialType(CreateTripDto) {}

export class TripQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  originLocationId?: string;

  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @IsOptional()
  @toBoolean()
  @IsBoolean()
  isMarketplaceVisible?: boolean;
}

export class AssignLoadDto {
  /** Existing stop to pick up from. Defaults to the shipment pickup location (stop auto-created). */
  @IsOptional()
  @IsUUID()
  pickupStopId?: string;

  @IsOptional()
  @IsUUID()
  dropoffStopId?: string;

  /** Used when the load has no shipment and no stop id is given. */
  @IsOptional()
  @IsUUID()
  pickupLocationId?: string;

  @IsOptional()
  @IsUUID()
  dropoffLocationId?: string;
}

export class CreateStopDto {
  @IsUUID()
  locationId: string;

  @IsIn([TripStopType.PICKUP, TripStopType.DROPOFF, TripStopType.WAYPOINT])
  type: TripStopType;

  @IsOptional()
  @toDate()
  @IsDate()
  plannedArrivalAt?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  plannedDepartureAt?: Date;
}

export class UpdateStopDto {
  @IsOptional()
  @toDate()
  @IsDate()
  plannedArrivalAt?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  plannedDepartureAt?: Date;
}

export class ReorderStopsDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('all', { each: true })
  stopIds: string[];
}

export class TripActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
