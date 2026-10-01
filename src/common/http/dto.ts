import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from './pagination';

export class IdParam {
  @IsUUID()
  id: string;
}

export const toDate = () => Type(() => Date);
export const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
export const toBoolean = () =>
  Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));

export class DateRangeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @toDate()
  @IsDate()
  from?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  to?: Date;
}

export class NearQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(2000)
  radiusKm?: number;
}
