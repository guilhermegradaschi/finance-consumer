import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { S3Module } from './infrastructure/s3/s3.module';
import { RabbitMQModule } from './infrastructure/rabbitmq/rabbitmq.module';
import { ObservabilityModule } from './infrastructure/observability/observability.module';
import { PersistenceModule } from './modules/persistence/persistence.module';
import { NfReceiverModule } from './modules/nf-receiver/nf-receiver.module';
import { XmlProcessorModule } from './modules/xml-processor/xml-processor.module';
import { BusinessValidatorModule } from './modules/business-validator/business-validator.module';
import { ApiGatewayModule } from './modules/api-gateway/api-gateway.module';
import { EmailConsumerModule } from './modules/email-consumer/email-consumer.module';
import { S3ListenerModule } from './modules/s3-listener/s3-listener.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        APP_NAME: Joi.string().default('nf-processor'),

        DB_HOST: Joi.string().default('localhost'),
        DB_PORT: Joi.number().default(5432),
        DB_USERNAME: Joi.string().default('nf_user'),
        DB_PASSWORD: Joi.string().default('nf_password'),
        DB_DATABASE: Joi.string().default('nf_processor'),
        DB_POOL_SIZE: Joi.number().default(20),

        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').default(''),
        REDIS_DB: Joi.number().default(0),
        REDIS_IDEMPOTENCY_TTL: Joi.number().default(86400),

        RABBITMQ_HOST: Joi.string().default('localhost'),
        RABBITMQ_PORT: Joi.number().default(5672),
        RABBITMQ_USERNAME: Joi.string().default('nf_user'),
        RABBITMQ_PASSWORD: Joi.string().default('nf_password'),
        RABBITMQ_VHOST: Joi.string().default('nf_processor'),
        RABBITMQ_PREFETCH: Joi.number().default(10),

        S3_ENDPOINT: Joi.string().default('http://localhost:9000'),
        S3_REGION: Joi.string().default('us-east-1'),
        S3_ACCESS_KEY: Joi.string().default('minioadmin'),
        S3_SECRET_KEY: Joi.string().default('minioadmin'),
        S3_BUCKET: Joi.string().default('nf-xmls'),
        S3_FORCE_PATH_STYLE: Joi.boolean().default(true),

        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('1h'),

        THROTTLE_TTL: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(100),

        IMAP_ENABLED: Joi.boolean().default(false),
        SQS_ENABLED: Joi.boolean().default(false),
        LOG_LEVEL: Joi.string().default('debug'),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    DatabaseModule,
    RedisModule,
    S3Module,
    RabbitMQModule,
    ObservabilityModule,
    PersistenceModule,
    NfReceiverModule,
    XmlProcessorModule,
    BusinessValidatorModule,
    ApiGatewayModule,
    EmailConsumerModule,
    S3ListenerModule,
  ],
})
export class AppModule {}
