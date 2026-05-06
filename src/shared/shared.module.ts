import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        APP_NAME: Joi.string().default('nf-processor'),
        APP_RUNTIME: Joi.string().valid('api', 'ingestion').default('api'),

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
        AUTH_DISABLED: Joi.boolean().default(false),

        THROTTLE_TTL: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(100),

        QIVE_API_URL: Joi.string().allow('').default(''),
        QIVE_API_KEY: Joi.string().allow('').default(''),
        QIVE_API_ID: Joi.string().allow('').default(''),

        BUYER_API_URL: Joi.string().allow('').default(''),
        SELLER_API_URL: Joi.string().allow('').default(''),

        IMAP_ENABLED: Joi.boolean().default(false),
        IMAP_USERNAME: Joi.string().allow('').default(''),
        IMAP_PASSWORD: Joi.string().allow('').default(''),
        IMAP_MOCK_ENABLED: Joi.boolean().default(false),
        IMAP_MOCK_XML_PATH: Joi.string().allow('').default(''),
        IMAP_MOCK_FIXTURE: Joi.string().allow('').default(''),

        SQS_ENABLED: Joi.boolean().default(false),
        LOG_LEVEL: Joi.string().default('debug'),

        NFE_LEGACY_RABBIT_PAYLOAD: Joi.boolean().default(false),
        NFE_OUTBOX_ENABLED: Joi.boolean().default(false),
        NFE_XSD_ENABLED: Joi.boolean().default(false),
        NFE_LEGACY_NOTA_FISCAL_ENABLED: Joi.boolean().default(true),
        NFE_DUAL_WRITE_EXTERNAL_INVOICE: Joi.boolean().default(false),

        QIVE_CRON_ENABLED: Joi.boolean().default(false),
        QIVE_CRON_EXPRESSION: Joi.string().default('0 */15 * * * *'),
        EXTERNAL_INVOICES_PROCESSOR_CRON_ENABLED: Joi.boolean().default(false),
        EXTERNAL_INVOICES_PROCESSOR_CRON_EXPRESSION: Joi.string().default('0 */10 * * * *'),
        IMAP_CRON_ENABLED: Joi.boolean().default(false),
        IMAP_CRON_EXPRESSION: Joi.string().default('0 */5 * * * *'),
        INVOICE_EVENTS_IMPORTER_CRON_ENABLED: Joi.boolean().default(false),
        INVOICE_EVENTS_IMPORTER_CRON_EXPRESSION: Joi.string().default('0 */10 * * * *'),
        INVOICE_EVENTS_PROCESSOR_CRON_ENABLED: Joi.boolean().default(false),

        NFE_QIVE_USE_SUBMIT_INGESTION: Joi.boolean().default(false),
        NFE_IMAP_USE_SUBMIT_INGESTION: Joi.boolean().default(false),

        IMAP_HOST: Joi.string().allow('').default(''),
        IMAP_PORT: Joi.number().default(993),
        IMAP_TLS: Joi.boolean().default(true),
        IMAP_MAX_ATTACHMENTS_PER_MAIL: Joi.number().default(10),
        IMAP_MAX_UNCOMPRESSED_ZIP_BYTES: Joi.number().default(20 * 1024 * 1024),

        SHUTDOWN_DRAIN_MS: Joi.number().default(25000),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
  ],
  exports: [ConfigModule],
})
export class SharedModule {}
