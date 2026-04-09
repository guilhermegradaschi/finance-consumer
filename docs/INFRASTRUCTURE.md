# INFRASTRUCTURE.md — PostgreSQL, Redis, RabbitMQ, S3, Observabilidade

## 1. PostgreSQL

### 1.1 Configuração de Conexão

```typescript
// src/config/database.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'nf_user',
  password: process.env.DB_PASSWORD || 'nf_password',
  database: process.env.DB_DATABASE || 'nf_processor',
  ssl: process.env.DB_SSL === 'true',
  poolSize: parseInt(process.env.DB_POOL_SIZE || '20', 10),
  idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10),
}));
```

### 1.2 Database Module

```typescript
// src/infrastructure/database/database.module.ts
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotaFiscal } from '../../modules/persistence/entities/nota-fiscal.entity';
import { NfItem } from '../../modules/persistence/entities/nf-item.entity';
import { NfEmitente } from '../../modules/persistence/entities/nf-emitente.entity';
import { NfDestinatario } from '../../modules/persistence/entities/nf-destinatario.entity';
import { NfTransporte } from '../../modules/persistence/entities/nf-transporte.entity';
import { NfPagamento } from '../../modules/persistence/entities/nf-pagamento.entity';
import { NfProcessingLog } from '../../modules/persistence/entities/nf-processing-log.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'nf_user'),
        password: configService.get<string>('DB_PASSWORD', 'nf_password'),
        database: configService.get<string>('DB_DATABASE', 'nf_processor'),
        entities: [
          NotaFiscal,
          NfItem,
          NfEmitente,
          NfDestinatario,
          NfTransporte,
          NfPagamento,
          NfProcessingLog,
        ],
        synchronize: false, // NUNCA true em produção. Usar migrations.
        migrationsRun: true, // Rodar migrations automaticamente no startup
        migrations: ['dist/migrations/*.js'],
        logging: configService.get<string>('NODE_ENV') === 'development' ? ['query', 'error'] : ['error'],
        extra: {
          max: configService.get<number>('DB_POOL_SIZE', 20),
          idleTimeoutMillis: configService.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
          connectionTimeoutMillis: configService.get<number>('DB_CONNECTION_TIMEOUT_MS', 5000),
        },
        ssl: configService.get<string>('DB_SSL') === 'true'
          ? { rejectUnauthorized: false }
          : false,
      }),
    }),
  ],
})
export class DatabaseModule {}
```

### 1.3 TypeORM CLI Config

```typescript
// src/infrastructure/database/typeorm.config.ts
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'nf_user',
  password: process.env.DB_PASSWORD || 'nf_password',
  database: process.env.DB_DATABASE || 'nf_processor',
  entities: ['src/modules/persistence/entities/*.entity.ts'],
  migrations: ['migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});
```

---

## 2. Redis

### 2.1 Configuração

```typescript
// src/config/redis.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'nf:',
  ttlSeconds: parseInt(process.env.REDIS_DEFAULT_TTL || '86400', 10), // 24h
}));
```

### 2.2 Redis Module

```typescript
// src/infrastructure/redis/redis.module.ts
import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

### 2.3 RedisService Completo

```typescript
// src/infrastructure/redis/redis.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private readonly keyPrefix: string;

  constructor(private readonly configService: ConfigService) {
    this.keyPrefix = this.configService.get<string>('REDIS_KEY_PREFIX', 'nf:');
  }

  async onModuleInit(): Promise<void> {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      db: this.configService.get<number>('REDIS_DB', 0),
      retryStrategy: (times: number) => {
        if (times > 10) {
          this.logger.error('Redis: max retry attempts reached');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 5000);
      },
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('close', () => this.logger.warn('Redis connection closed'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(this.prefixKey(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    if (ttlSeconds) {
      await this.client.setex(prefixedKey, ttlSeconds, value);
    } else {
      await this.client.set(prefixedKey, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.prefixKey(key));
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(this.prefixKey(key));
    return result === 1;
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(this.prefixKey(key), value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(this.prefixKey(key));
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(this.prefixKey(key), ttlSeconds);
  }

  getClient(): Redis {
    return this.client;
  }
}
```

### 2.4 IdempotencyService

```typescript
// src/infrastructure/redis/idempotency.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface IdempotencyResult {
  isDuplicate: boolean;
  existingData?: Record<string, any>;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly TTL_SECONDS = 86400; // 24h
  private readonly KEY_PREFIX = 'idempotency:';

  constructor(private readonly redisService: RedisService) {}

  async check(idempotencyKey: string): Promise<IdempotencyResult> {
    const key = `${this.KEY_PREFIX}${idempotencyKey}`;
    const existing = await this.redisService.get(key);

    if (existing) {
      this.logger.debug(`Idempotency hit: key=${idempotencyKey}`);
      return {
        isDuplicate: true,
        existingData: JSON.parse(existing),
      };
    }

    return { isDuplicate: false };
  }

  async register(idempotencyKey: string, data: Record<string, any>): Promise<boolean> {
    const key = `${this.KEY_PREFIX}${idempotencyKey}`;

    // SetNX + TTL atômico — garante que só o primeiro registro vence
    const acquired = await this.redisService.setNx(key, JSON.stringify(data), this.TTL_SECONDS);

    if (acquired) {
      this.logger.debug(`Idempotency registered: key=${idempotencyKey}`);
    } else {
      this.logger.debug(`Idempotency already exists: key=${idempotencyKey}`);
    }

    return acquired;
  }

  async update(idempotencyKey: string, data: Record<string, any>): Promise<void> {
    const key = `${this.KEY_PREFIX}${idempotencyKey}`;
    await this.redisService.set(key, JSON.stringify(data), this.TTL_SECONDS);
  }

  async remove(idempotencyKey: string): Promise<void> {
    const key = `${this.KEY_PREFIX}${idempotencyKey}`;
    await this.redisService.del(key);
  }
}
```

---

## 3. RabbitMQ

Toda a configuração está detalhada no arquivo `MESSAGING.md`. Aqui está o resumo da configuração de conexão:

```typescript
// src/config/rabbitmq.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL || 'amqp://nf_user:nf_password@localhost:5672/nf_processor',
  heartbeat: parseInt(process.env.RABBITMQ_HEARTBEAT || '60', 10),
  prefetchDefault: parseInt(process.env.RABBITMQ_PREFETCH_DEFAULT || '10', 10),
}));
```

---

## 4. AWS S3

### 4.1 Configuração

```typescript
// src/config/s3.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('s3', () => ({
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.S3_BUCKET || 'nf-processor-xmls',
  endpoint: process.env.S3_ENDPOINT || undefined, // Para MinIO local
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // Para MinIO
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
}));
```

### 4.2 S3 Module

```typescript
// src/infrastructure/s3/s3.module.ts
import { Module, Global } from '@nestjs/common';
import { S3Service } from './s3.service';

@Global()
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
```

### 4.3 S3Service Completo

```typescript
// src/infrastructure/s3/s3.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const forcePathStyle = this.configService.get<string>('S3_FORCE_PATH_STYLE') === 'true';
    this.bucket = this.configService.getOrThrow<string>('S3_BUCKET');

    const clientConfig: any = { region };

    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = forcePathStyle;
    }

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }

    this.client = new S3Client(clientConfig);
    this.logger.log(`S3 client initialized: bucket=${this.bucket}, region=${region}`);
  }

  async upload(key: string, body: string | Buffer, contentType: string = 'application/xml'): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'uploaded-at': new Date().toISOString(),
        'service': 'nf-processor',
      },
    });

    await this.client.send(command);
    this.logger.debug(`Uploaded to S3: s3://${this.bucket}/${key}`);
    return key;
  }

  async download(key: string, bucketOverride?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucketOverride || this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString('utf-8');
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.debug(`Deleted from S3: s3://${this.bucket}/${key}`);
  }

  async listByPrefix(prefix: string, maxKeys: number = 100): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await this.client.send(command);
    return (response.Contents || []).map((obj) => obj.Key!);
  }

  /**
   * Estrutura de pastas no S3:
   * nfe/
   *   {year}/
   *     {chaveAcesso}.xml          ← XML original da NF-e
   *
   * Exemplo: nfe/2024/35240112345678000195550010000001231234567890.xml
   */
  buildNfKey(chaveAcesso: string, year?: number): string {
    const y = year || new Date().getFullYear();
    return `nfe/${y}/${chaveAcesso}.xml`;
  }
}
```

---

## 5. Observabilidade (SigNoz + OpenTelemetry)

### 5.1 Configuração de Tracing

```typescript
// src/infrastructure/observability/tracing.config.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const SIGNOZ_ENDPOINT = process.env.SIGNOZ_ENDPOINT || 'http://localhost:4318';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'nf-processor',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${SIGNOZ_ENDPOINT}/v1/traces`,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${SIGNOZ_ENDPOINT}/v1/metrics`,
    }),
    exportIntervalMillis: 60000, // 1 minuto
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-redis-4': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});

export default sdk;
```

**Importante**: Este arquivo deve ser importado ANTES de qualquer outro import no `main.ts`:

```typescript
// src/main.ts — primeira linha
import './infrastructure/observability/tracing.config';
// ... demais imports
```

### 5.2 Logger Service Customizado

```typescript
// src/infrastructure/observability/logger.service.ts
import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLoggerService implements NestLoggerService {
  private contextName = 'Application';

  setContext(name: string): void {
    this.contextName = name;
  }

  log(message: string, ...optionalParams: any[]): void {
    const traceId = this.getTraceId();
    const logEntry = this.formatLog('INFO', message, traceId);
    console.log(JSON.stringify(logEntry));
  }

  error(message: string, trace?: string, ...optionalParams: any[]): void {
    const traceId = this.getTraceId();
    const logEntry = this.formatLog('ERROR', message, traceId, trace);

    // Marcar span atual como erro
    const activeSpan = this.getActiveSpan();
    if (activeSpan) {
      activeSpan.setStatus({ code: SpanStatusCode.ERROR, message });
      activeSpan.recordException(new Error(message));
    }

    console.error(JSON.stringify(logEntry));
  }

  warn(message: string, ...optionalParams: any[]): void {
    const traceId = this.getTraceId();
    const logEntry = this.formatLog('WARN', message, traceId);
    console.warn(JSON.stringify(logEntry));
  }

  debug(message: string, ...optionalParams: any[]): void {
    if (process.env.NODE_ENV === 'development') {
      const traceId = this.getTraceId();
      const logEntry = this.formatLog('DEBUG', message, traceId);
      console.debug(JSON.stringify(logEntry));
    }
  }

  verbose(message: string, ...optionalParams: any[]): void {
    // No-op em produção
  }

  private formatLog(level: string, message: string, traceId?: string, stack?: string) {
    return {
      timestamp: new Date().toISOString(),
      level,
      context: this.contextName,
      message,
      traceId: traceId || undefined,
      stack: stack || undefined,
      service: 'nf-processor',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  private getTraceId(): string | undefined {
    const span = trace.getSpan(context.active());
    if (span) {
      return span.spanContext().traceId;
    }
    return undefined;
  }

  private getActiveSpan() {
    return trace.getSpan(context.active());
  }
}
```

### 5.3 Logging Interceptor

```typescript
// src/common/interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body } = req;
    const startTime = Date.now();

    this.logger.log(`→ ${method} ${url}`);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const res = context.switchToHttp().getResponse();
          this.logger.log(`← ${method} ${url} ${res.statusCode} ${duration}ms`);
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(`← ${method} ${url} ${error.status || 500} ${duration}ms — ${error.message}`);
        },
      }),
    );
  }
}
```

### 5.4 Observability Module

```typescript
// src/infrastructure/observability/observability.module.ts
import { Module, Global } from '@nestjs/common';
import { AppLoggerService } from './logger.service';

@Global()
@Module({
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class ObservabilityModule {}
```
