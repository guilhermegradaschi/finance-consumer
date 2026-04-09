import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request } from 'express';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class UserRateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const user = req.user;
    const keyPart = user?.sub ?? `ip:${req.ip ?? 'unknown'}`;
    const max = this.configService.get<number>('USER_RATE_LIMIT_MAX', 120);
    const windowMs = this.configService.get<number>('USER_RATE_LIMIT_WINDOW_MS', 60000);
    const { allowed } = await this.redisService.slidingWindowHit(`rl:user:${keyPart}`, windowMs, max);
    if (!allowed) {
      throw new ThrottlerException('Too many requests for this user');
    }
    return true;
  }
}
