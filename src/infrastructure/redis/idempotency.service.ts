import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@infra/redis/redis.service';

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  existingData?: Record<string, unknown>;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly ttl: number;
  private readonly keyPrefix = 'idempotency:';

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttl = this.configService.get<number>('REDIS_IDEMPOTENCY_TTL', 86400);
  }

  async check(key: string): Promise<IdempotencyCheckResult> {
    const existing = await this.redisService.get(this.keyPrefix + key);
    if (existing) {
      return { isDuplicate: true, existingData: JSON.parse(existing) as Record<string, unknown> };
    }
    return { isDuplicate: false };
  }

  async register(key: string, data: Record<string, unknown>): Promise<boolean> {
    const acquired = await this.redisService.setNx(this.keyPrefix + key, JSON.stringify(data), this.ttl);
    if (!acquired) {
      this.logger.warn(`Duplicate detected for key: ${key}`);
    }
    return acquired;
  }

  async update(key: string, data: Record<string, unknown>): Promise<void> {
    await this.redisService.set(this.keyPrefix + key, JSON.stringify(data), this.ttl);
  }

  async remove(key: string): Promise<void> {
    await this.redisService.del(this.keyPrefix + key);
  }
}
