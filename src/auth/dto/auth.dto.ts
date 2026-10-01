import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../common/http/dto';
import { OrganizationType } from '../../common/enums';

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;
export const PASSWORD_MESSAGE =
  'password must be 10-128 chars with upper, lower case letters and a digit';

const REGISTRABLE_TYPES = Object.values(OrganizationType).filter(
  (t) => t !== OrganizationType.PLATFORM_ADMIN,
);

export class RegisterOrganizationDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsIn(REGISTRABLE_TYPES)
  type: OrganizationType;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class RegisterDto {
  @trim()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

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

  @ValidateNested()
  @Type(() => RegisterOrganizationDto)
  organization: RegisterOrganizationDto;
}

export class LoginDto {
  @trim()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refreshToken: string;
}

export class SwitchOrganizationDto {
  @IsUUID()
  organizationId: string;
}

export class AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  organizationId: string | null;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
