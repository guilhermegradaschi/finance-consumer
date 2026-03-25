import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  providers: [RedisService, IdempotencyService],
  exports: [RedisService, IdempotencyService],
})
export class RedisModule {}
