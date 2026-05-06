import { Module, Global } from '@nestjs/common';
import { RedisService } from '@infra/redis/redis.service';
import { IdempotencyService } from '@infra/redis/idempotency.service';

@Global()
@Module({
  providers: [RedisService, IdempotencyService],
  exports: [RedisService, IdempotencyService],
})
export class RedisModule {}
