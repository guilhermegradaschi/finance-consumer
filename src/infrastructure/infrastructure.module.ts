import { Module } from '@nestjs/common';
import { DatabaseModule } from '@infra/database/database.module';
import { RedisModule } from '@infra/redis/redis.module';
import { S3Module } from '@infra/s3/s3.module';
import { RabbitMQModule } from '@infra/messaging/rabbitmq/rabbitmq.module';
import { ObservabilityModule } from '@infra/observability/observability.module';
import { HttpInfraModule } from '@infra/http/http.module';
import { ShutdownModule } from '@infra/shutdown/shutdown.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    S3Module,
    RabbitMQModule,
    ObservabilityModule,
    HttpInfraModule,
    ShutdownModule,
  ],
  exports: [
    DatabaseModule,
    RedisModule,
    S3Module,
    RabbitMQModule,
    ObservabilityModule,
    HttpInfraModule,
    ShutdownModule,
  ],
})
export class InfrastructureModule {}
