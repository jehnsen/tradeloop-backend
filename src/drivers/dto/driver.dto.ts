import { PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/http/dto';
import { PaginationQueryDto } from '../../common/http/pagination';
import { DriverStatus } from '../driver.entity';

export class CreateDriverDto {
  /** Links the driver to a user account (must be a member of the organization) for mobile tracking. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  licenseNumber: string;

  @IsOptional()
  @IsDateString({ strict: true })
  licenseExpiry?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {}

export class DriverQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
