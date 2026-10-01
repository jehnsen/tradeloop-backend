import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthContext } from '../common/auth/auth-context';
import { CurrentAuth, Public } from '../common/auth/decorators';
import { AuthService } from './auth.service';
import {
  AuthTokensDto,
  ChangePasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  SwitchOrganizationDto,
} from './dto/auth.dto';

const authThrottle = {
  default: { limit: () => Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 },
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(authThrottle)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthTokensDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @HttpCode(204)
  @Post('logout')
  logout(@CurrentAuth() auth: AuthContext) {
    return this.auth.logout(auth);
  }

  @ApiBearerAuth()
  @HttpCode(204)
  @Post('logout-all')
  logoutAll(@CurrentAuth() auth: AuthContext) {
    return this.auth.logoutAll(auth);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('switch-organization')
  switchOrganization(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SwitchOrganizationDto,
  ): Promise<AuthTokensDto> {
    return this.auth.switchOrganization(auth, dto.organizationId);
  }

  @ApiBearerAuth()
  @Throttle(authThrottle)
  @HttpCode(204)
  @Post('change-password')
  changePassword(@CurrentAuth() auth: AuthContext, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(auth, dto);
  }
}
