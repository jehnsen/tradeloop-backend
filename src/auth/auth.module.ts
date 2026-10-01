import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../common/config/configuration';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthContextService } from './auth-context.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshSession } from './entities/refresh-session.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TokenRevocationService } from './token-revocation.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshSession]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const jwt = config.get('jwt', { infer: true });
        return {
          secret: jwt.accessSecret,
          signOptions: {
            expiresIn: jwt.accessTtlSeconds,
            issuer: 'tradeloop',
            audience: 'tradeloop-api',
          },
          verifyOptions: { issuer: 'tradeloop', audience: 'tradeloop-api', algorithms: ['HS256'] },
        };
      },
    }),
    UsersModule,
    OrganizationsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    TokenRevocationService,
    AuthContextService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthContextService, TokenService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
