import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toBoolean, trim } from '../../common/http/dto';
import { PaginationQueryDto } from '../../common/http/pagination';
import { LocationType } from '../location.entity';

export class CreateLocationDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  addressLine?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  barangay?: string;

  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city: string;

  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  province: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  /** Platform admins only: create a location shared with every tenant. */
  @IsOptional()
  @IsBoolean()
  shared?: boolean;
}

export class UpdateLocationDto extends PartialType(
  OmitType(CreateLocationDto, ['shared'] as const),
) {}

export class LocationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @toBoolean()
  @IsBoolean()
  includeShared?: boolean = true;

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
