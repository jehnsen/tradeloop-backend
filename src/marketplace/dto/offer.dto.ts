import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toDate } from '../../common/http/dto';
import { PaginationQueryDto } from '../../common/http/pagination';
import { BookingStatus, OfferStatus } from '../entities/marketplace.enums';

export class CreateOfferDto {
  @IsOptional()
  @IsUUID()
  vehiclePostingId?: string;

  @IsOptional()
  @IsUUID()
  loadPostingId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  amount: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @toDate()
  @IsDate()
  expiresAt?: Date;
}

export class CounterOfferDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @toDate()
  @IsDate()
  expiresAt?: Date;
}

export class OfferQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OfferStatus)
  status?: OfferStatus;

  @IsOptional()
  @IsUUID()
  loadPostingId?: string;

  @IsOptional()
  @IsUUID()
  vehiclePostingId?: string;
}

export class BookingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsIn(['shipper', 'carrier'])
  role?: 'shipper' | 'carrier';

  @IsOptional()
  @IsUUID()
  tripId?: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
