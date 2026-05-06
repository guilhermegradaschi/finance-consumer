import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from '@context/platform/infrastructure/http/auth.controller';
import { HealthController } from '@context/platform/infrastructure/http/health.controller';
import { JwtStrategy } from '@context/platform/infrastructure/auth/jwt.strategy';
import { JwtAuthGuard } from '@context/platform/infrastructure/auth/jwt-auth.guard';
import { UserRateLimitGuard } from '@context/platform/infrastructure/auth/user-rate-limit.guard';
import { TokenBlacklistService } from '@context/platform/application/services/token-blacklist.service';
import { HealthService } from '@context/platform/infrastructure/health/health.service';
import { NfeLegacyModule } from '@context/nfe-legacy/nfe-legacy.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    NfeLegacyModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),
  ],
  controllers: [AuthController, HealthController],
  providers: [
    JwtStrategy,
    JwtAuthGuard,
    UserRateLimitGuard,
    TokenBlacklistService,
    HealthService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [JwtAuthGuard, UserRateLimitGuard, TokenBlacklistService, HealthService],
})
export class PlatformModule {}
