import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_RULE } from '../../auth/dto/auth.dto';
import { trim } from '../../common/http/dto';
import { PaginationQueryDto } from '../../common/http/pagination';
import { CommissionType, OrganizationType, Role } from '../../common/enums';
import { MembershipStatus } from '../entities/organization-membership.entity';
import { OrganizationStatus } from '../entities/organization.entity';

export class UpdateOrganizationDto {
  @IsOptional()
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class NewUserDto {
  @trim()
  @IsEmail()
  @MaxLength(254)
  email: string;

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

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;
}

export class AdminCreateOrganizationDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(OrganizationType)
  type: OrganizationType;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ValidateNested()
  @Type(() => NewUserDto)
  owner: NewUserDto;
}

export class OrganizationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;

  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class DirectoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class UpdateOrganizationStatusDto {
  @IsEnum(OrganizationStatus)
  status: OrganizationStatus;
}

export class UpdateCommissionDto {
  /** null resets the organization to the platform default. */
  @ValidateIf((o: UpdateCommissionDto) => o.type !== null)
  @IsEnum(CommissionType)
  type: CommissionType | null;

  @ValidateIf((o: UpdateCommissionDto) => o.type !== null && o.type !== CommissionType.NONE)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  value?: number;
}

const SUBJECT_REF = /^(DRV|CUS)-[A-Z0-9-]{1,32}$/;

export class AddMemberDto {
  @trim()
  @IsEmail()
  email: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password?: string;

  /** Operations record the login acts as: DRV-… for a DRIVER, CUS-… for a CUSTOMER. */
  @IsOptional()
  @Matches(SUBJECT_REF, { message: 'subjectRef must be a driver (DRV-…) or customer (CUS-…) id' })
  subjectRef?: string;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsIn([MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED])
  status?: MembershipStatus;

  /** Driver or customer record the login acts as; null unlinks it. */
  @IsOptional()
  @Matches(SUBJECT_REF, { message: 'subjectRef must be a driver (DRV-…) or customer (CUS-…) id' })
  subjectRef?: string | null;
}

export class AddPartnerDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  partnerOrganizationCode: string;
}
