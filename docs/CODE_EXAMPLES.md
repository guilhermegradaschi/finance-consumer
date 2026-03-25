# CODE_EXAMPLES.md — Exemplos Completos e Funcionais

## 1. main.ts (Bootstrap)

```typescript
// src/main.ts
import './infrastructure/observability/tracing.config'; // DEVE ser o primeiro import

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsService } from './infrastructure/observability/metrics.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Validação global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Remove propriedades não declaradas no DTO
      forbidNonWhitelisted: true, // Retorna erro se propriedades extras forem enviadas
      transform: true,           // Transforma tipos automaticamente (string→number via @Type)
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Exception filter global
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Logging interceptor global
  const metricsService = app.get(MetricsService);
  app.useGlobalInterceptors(new LoggingInterceptor(metricsService));

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('NF-e Processor API')
    .setDescription('API para processamento de Notas Fiscais Eletrônicas')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
  logger.log(`Swagger available at http://localhost:${port}/api/docs`);
}

bootstrap();
```

---

## 2. app.module.ts (Módulo Raiz)

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// Infraestrutura
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RabbitMQModule } from './infrastructure/rabbitmq/rabbitmq.module';
import { S3Module } from './infrastructure/s3/s3.module';
import { ObservabilityModule } from './infrastructure/observability/observability.module';

// Módulos de negócio
import { NfReceiverModule } from './modules/nf-receiver/nf-receiver.module';
import { XmlProcessorModule } from './modules/xml-processor/xml-processor.module';
import { BusinessValidatorModule } from './modules/business-validator/business-validator.module';
import { PersistenceModule } from './modules/persistence/persistence.module';
import { ApiGatewayModule } from './modules/api-gateway/api-gateway.module';
import { EmailConsumerModule } from './modules/email-consumer/email-consumer.module';
import { S3ListenerModule } from './modules/s3-listener/s3-listener.module';

// Config
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import rabbitmqConfig from './config/rabbitmq.config';
import s3Config from './config/s3.config';

@Module({
  imports: [
    // Configuração global
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      load: [databaseConfig, redisConfig, rabbitmqConfig, s3Config],
    }),

    // Scheduler
    ScheduleModule.forRoot(),

    // Rate limiting
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60000, limit: 100 },
    ]),

    // Infraestrutura
    DatabaseModule,
    RedisModule,
    RabbitMQModule,
    S3Module,
    ObservabilityModule,

    // Negócio
    PersistenceModule,      // Primeiro: entities e repos usados por todos
    NfReceiverModule,
    XmlProcessorModule,
    BusinessValidatorModule,
    ApiGatewayModule,
    EmailConsumerModule,
    S3ListenerModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

---

## 3. Env Validation (Config)

```typescript
// src/config/app.config.ts
import { plainToInstance } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsEnum, validateSync, Min, Max } from 'class-validator';

class EnvironmentVariables {
  @IsEnum(['development', 'staging', 'production'])
  NODE_ENV: string = 'development';

  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  DB_HOST: string;

  @IsNumber()
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number = 6379;

  @IsString()
  RABBITMQ_URL: string;

  @IsString()
  S3_BUCKET: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  SEFAZ_API_URL?: string;

  @IsString()
  @IsOptional()
  SEFAZ_API_TOKEN?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }

  return validatedConfig;
}
```

---

## 4. Custom Repository

```typescript
// Exemplo de uso do NotaFiscalRepository em um controller:
@Get('stats')
async getStats() {
  const summary = await this.nfRepository.getStatusSummary();
  const recentErrors = await this.processingLogRepo.getFailedLogs(10);

  return {
    statusSummary: summary,
    recentErrors: recentErrors.map((log) => ({
      chaveAcesso: log.chaveAcesso,
      stage: log.stage,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt,
    })),
  };
}
```

---

## 5. Consumer RabbitMQ Completo (com métricas)

```typescript
// Exemplo de consumer com métricas e tracing integrados
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { MetricsService } from '../../infrastructure/observability/metrics.service';
import { XmlProcessorService } from './xml-processor.service';
import { QUEUES, PREFETCH_COUNTS } from '../../common/constants/queues.constants';
import { NonRetryableException } from '../../common/exceptions/non-retryable.exception';

@Injectable()
export class XmlProcessorConsumer implements OnModuleInit {
  private readonly logger = new Logger(XmlProcessorConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly xmlProcessorService: XmlProcessorService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMQService.consume({
      queue: QUEUES.XML_PROCESSOR,
      prefetch: PREFETCH_COUNTS.XML_PROCESSOR,
      handler: async (msg, content) => {
        const startTime = Date.now();
        const { chaveAcesso, attemptNumber } = content;

        this.logger.log(
          `[XML_PROCESS] Start: chaveAcesso=${chaveAcesso}, attempt=${attemptNumber}`,
        );

        try {
          await this.xmlProcessorService.process(content);

          const duration = Date.now() - startTime;
          this.metricsService.incrementProcessed();
          this.metricsService.recordProcessingDuration('XML_PROCESS', duration);

          this.logger.log(
            `[XML_PROCESS] Success: chaveAcesso=${chaveAcesso}, duration=${duration}ms`,
          );
        } catch (error) {
          const duration = Date.now() - startTime;
          this.metricsService.incrementError('XML_PROCESS', (error as any).errorCode || 'UNKNOWN');

          if (error instanceof NonRetryableException) {
            this.logger.error(
              `[XML_PROCESS] Non-retryable error: ${error.errorCode} — ${error.message}`,
            );
          } else {
            this.metricsService.incrementRetry('XML_PROCESS');
            this.logger.warn(
              `[XML_PROCESS] Retryable error: ${(error as Error).message}, attempt=${attemptNumber}`,
            );
          }

          throw error; // Re-throw para RabbitMQService lidar com retry/DLQ
        }
      },
    });

    this.logger.log('XmlProcessorConsumer registered and listening');
  }
}
```

---

## 6. DTO com Validação Completa

```typescript
// Exemplo avançado de DTO com validações customizadas
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class ReprocessNfDto {
  @ApiProperty({
    description: 'Chave de acesso da NF-e (44 dígitos numéricos)',
    example: '35240112345678000195550010000001231234567890',
    pattern: '^[0-9]{44}$',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{44}$/, { message: 'chaveAcesso deve conter exatamente 44 dígitos numéricos' })
  chaveAcesso: string;

  @ApiPropertyOptional({
    description: 'Forçar reprocessamento mesmo se status atual for COMPLETED',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  force?: boolean;

  @ApiPropertyOptional({
    description: 'Estágio a partir do qual reprocessar',
    enum: ['RECEIVE', 'XML_PROCESS', 'BUSINESS_VALIDATE', 'PERSIST'],
  })
  @IsOptional()
  @IsEnum(['RECEIVE', 'XML_PROCESS', 'BUSINESS_VALIDATE', 'PERSIST'])
  fromStage?: string;

  @ApiPropertyOptional({ description: 'Motivo do reprocessamento' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

---

## 7. Guard de Autenticação com Roles

```typescript
// src/common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => {
  return (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(ROLES_KEY, roles, descriptor?.value || target);
    return descriptor || target;
  };
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>(ROLES_KEY, context.getHandler());
    if (!requiredRoles) {
      return true; // Se não tem @Roles decorador, acesso livre
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roles) {
      throw new ForbiddenException('Sem roles definidas para este usuário');
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException(
        `Requer uma das roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}

// Uso no controller:
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('nf:submit')
// @Post()
// async submitNf(@Body() dto: SubmitNfDto) { ... }
```

---

## 8. Metrics Interceptor

```typescript
// src/common/interceptors/metrics.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../../infrastructure/observability/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const req = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.metricsService.recordProcessingDuration(`http_${req.method}_${req.route?.path}`, duration);
        },
        error: () => {
          const duration = Date.now() - startTime;
          this.metricsService.recordProcessingDuration(`http_${req.method}_${req.route?.path}_error`, duration);
        },
      }),
    );
  }
}
```

---

## 9. Exception Filter Completo

```typescript
// src/common/filters/global-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { NonRetryableException } from '../exceptions/non-retryable.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let errorCode: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      message = res.message || exception.message;
      errorCode = res.errorCode || `NF_${status}_000`;
    } else if (exception instanceof NonRetryableException) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      message = exception.message;
      errorCode = exception.errorCode;
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Erro interno do servidor';
      errorCode = 'NF_500_001';

      // Log completo do erro interno
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Erro desconhecido';
      errorCode = 'NF_500_000';
    }

    response.status(status).json({
      statusCode: status,
      errorCode,
      message: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
```

---

## 10. Teste Unitário Completo

```typescript
// src/common/utils/__tests__/xml.util.spec.ts
import { extractChaveAcessoFromXml } from '../xml.util';
import { VALID_NFE_XML } from '../../../../test/fixtures/valid-nfe.xml';

describe('extractChaveAcessoFromXml', () => {
  it('deve extrair chaveAcesso do atributo Id da tag infNFe', () => {
    const xml = '<infNFe Id="NFe35240112345678000195550010000001231234567890" versao="4.00">';
    const result = extractChaveAcessoFromXml(xml);
    expect(result).toBe('35240112345678000195550010000001231234567890');
  });

  it('deve extrair chaveAcesso da tag chNFe', () => {
    const xml = '<chNFe>35240112345678000195550010000001231234567890</chNFe>';
    const result = extractChaveAcessoFromXml(xml);
    expect(result).toBe('35240112345678000195550010000001231234567890');
  });

  it('deve retornar null para XML sem chave de acesso', () => {
    const xml = '<root><data>no chave here</data></root>';
    const result = extractChaveAcessoFromXml(xml);
    expect(result).toBeNull();
  });

  it('deve extrair chaveAcesso do XML fixture completo', () => {
    const result = extractChaveAcessoFromXml(VALID_NFE_XML);
    expect(result).toBe('35240112345678000195550010000001231234567890');
  });

  it('deve retornar null para string vazia', () => {
    expect(extractChaveAcessoFromXml('')).toBeNull();
  });

  it('deve retornar null se chave tem menos de 44 dígitos', () => {
    const xml = '<chNFe>12345</chNFe>';
    expect(extractChaveAcessoFromXml(xml)).toBeNull();
  });
});
```

---

## 11. Teste de Integração com Redis

```typescript
// test/integration/redis-idempotency.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { IdempotencyService } from '../../src/infrastructure/redis/idempotency.service';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

describe('IdempotencyService (Integration)', () => {
  let module: TestingModule;
  let idempotencyService: IdempotencyService;
  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    redisContainer = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .start();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              REDIS_HOST: redisContainer.getHost(),
              REDIS_PORT: redisContainer.getMappedPort(6379),
              REDIS_KEY_PREFIX: 'test:',
            }),
          ],
        }),
      ],
      providers: [RedisService, IdempotencyService],
    }).compile();

    await module.init();
    idempotencyService = module.get<IdempotencyService>(IdempotencyService);
  }, 30000);

  afterAll(async () => {
    await module.close();
    await redisContainer.stop();
  });

  it('deve registrar e verificar idempotência corretamente', async () => {
    const key = 'test-key-001';
    const data = { id: 'uuid-1', status: 'RECEIVED' };

    // Primeira vez: register deve retornar true
    const registered = await idempotencyService.register(key, data);
    expect(registered).toBe(true);

    // Segunda vez: check deve retornar isDuplicate=true
    const check = await idempotencyService.check(key);
    expect(check.isDuplicate).toBe(true);
    expect(check.existingData).toEqual(data);
  });

  it('deve permitir update de dados existentes', async () => {
    const key = 'test-key-002';

    await idempotencyService.register(key, { status: 'RECEIVED' });
    await idempotencyService.update(key, { status: 'COMPLETED' });

    const check = await idempotencyService.check(key);
    expect(check.existingData!.status).toBe('COMPLETED');
  });

  it('deve permitir remoção', async () => {
    const key = 'test-key-003';

    await idempotencyService.register(key, { status: 'RECEIVED' });
    await idempotencyService.remove(key);

    const check = await idempotencyService.check(key);
    expect(check.isDuplicate).toBe(false);
  });

  it('SETNX deve rejeitar segunda escrita concorrente', async () => {
    const key = 'test-key-concurrent';

    const [first, second] = await Promise.all([
      idempotencyService.register(key, { id: 'first' }),
      idempotencyService.register(key, { id: 'second' }),
    ]);

    // Exatamente um deve ter sucesso
    expect([first, second].filter(Boolean)).toHaveLength(1);

    // O dado armazenado deve ser do primeiro que venceu
    const check = await idempotencyService.check(key);
    expect(check.isDuplicate).toBe(true);
  });
});
```
