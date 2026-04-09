import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class TokenBlacklistService {
  private static readonly PREFIX = 'jwt:blk:';

  constructor(private readonly redisService: RedisService) {}

  async revoke(token: string): Promise<void> {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    const now = Math.floor(Date.now() / 1000);
    const ttlSec = decoded?.exp ? Math.max(1, decoded.exp - now) : 3600;
    const hash = createHash('sha256').update(token).digest('hex');
    await this.redisService.set(`${TokenBlacklistService.PREFIX}${hash}`, '1', ttlSec);
  }

  async isRevoked(token: string): Promise<boolean> {
    const hash = createHash('sha256').update(token).digest('hex');
    const v = await this.redisService.get(`${TokenBlacklistService.PREFIX}${hash}`);
    return v === '1';
  }
}
