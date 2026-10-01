import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { toDate } from '../../common/http/dto';
import { LocationSource } from '../vehicle-location.entity';

export class LocationUpdateDto {
  @IsUUID()
  vehicleId: string;

  /** Defaults to the vehicle's (or driver's) active trip. */
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(300)
  speedKph?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracyMeters?: number;

  /** Device timestamp (UTC). Defaults to server receive time. */
  @IsOptional()
  @toDate()
  @IsDate()
  recordedAt?: Date;

  @IsOptional()
  @IsEnum(LocationSource)
  source?: LocationSource;
}

export class TrackingHistoryQueryDto {
  @IsOptional()
  @toDate()
  @IsDate()
  from?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 500;
}
