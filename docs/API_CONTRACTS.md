# API_CONTRACTS.md — Endpoints REST, DTOs, Autenticação e Swagger

## 0. Políticas de produto (NFe) — defaults implementados

| Tema | Default | Observação |
|------|---------|------------|
| Evento de cancelamento antes da NF existir | Evento registrado em `invoice_events` / fluxo Qive com status `SKIPPED` até a NF aparecer; ingestão HTTP grava `nfe_events` e encaminha para `InvoiceEventCreator` | Evolução: fila dedicada com retry/backoff (ver checklist §0). |
| Segunda ingestão mesma `access_key` com XML diferente | Conflito na idempotência (`nfe_ingestions` / Redis) — duplicata não republica | Alinhar com alerta operacional se necessário. |
| SKU obrigatório para `processed` | `ExternalInvoice` pode ir a `PROCESSED` sem `sku_id` em itens; associação assíncrona existente | Métricas de cobertura SKU podem ser adicionadas. |
| Rotas HTTP | `/api/v1/nf` mantido; `/ingest/nfe/*` como contrato novo | Deprecação documentada por release. |
| Códigos de erro estáveis (ingestão) | `XML_MALFORMED`, `INVALID_PAYLOAD`, `S3_UPLOAD_FAILED`, `NF001`… | Resposta JSON via exception filter (`code`, `message`). |

## 1. Visão Geral da API

| Método | Endpoint                          | Descrição                        | Auth | Rate Limit   |
|--------|-----------------------------------|----------------------------------|------|--------------|
| POST   | /api/v1/nf                        | Submeter NF-e para processamento | JWT  | 100 req/min  |
| POST   | /ingest/nfe/provider              | Ingestão JSON (xmlContent ou xml_base64) | JWT  | 60 req/min (Throttle) |
| POST   | /ingest/nfe/provider/upload      | Ingestão multipart (file)       | JWT  | 60 req/min   |
| POST   | /ingest/nfe/events               | Evento NFe (XML/base64)         | JWT  | 60 req/min   |
| POST   | /admin/invoices/:accessKey/reprocess | Alias de reprocessamento   | JWT  | herdado      |
| GET    | /api/v1/nf                        | Listar NF-es com filtros         | JWT  | 200 req/min  |
| GET    | /api/v1/nf/:chaveAcesso           | Consultar NF-e por chave         | JWT  | 200 req/min  |
| GET    | /api/v1/nf/:chaveAcesso/logs      | Logs de processamento            | JWT  | 200 req/min  |
| GET    | /api/v1/nf/summary/status         | Resumo por status                | JWT  | 50 req/min   |
| POST   | /api/v1/nf/reprocess/:chaveAcesso | Reprocessar NF-e com erro        | JWT  | 20 req/min   |
| GET    | /health                           | Health check                     | Não  | -            |
| GET    | /health/ready                     | Readiness                        | Não  | -            |
| GET    | /health/live                      | Liveness                         | Não  | -            |

---

## 2. Autenticação

### 2.1 JWT Bearer Token

Todas as rotas `/api/v1/*` requerem header `Authorization: Bearer <token>`.

O token JWT deve conter:

```json
{
  "sub": "client-id-001",
  "iat": 1700000000,
  "exp": 1700086400,
  "roles": ["nf:submit", "nf:read"],
  "iss": "nf-processor-auth"
}
```

### 2.2 Guard de Autenticação

```typescript
// src/common/guards/jwt-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly jwtSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token JWT ausente ou formato inválido');
    }

    const token = authHeader.substring(7);

    try {
      const payload = jwt.verify(token, this.jwtSecret) as Record<string, any>;
      request.user = {
        clientId: payload.sub,
        roles: payload.roles || [],
      };
      return true;
    } catch (error) {
      this.logger.warn(`JWT validation failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Token JWT inválido ou expirado');
    }
  }
}
```

---

## 3. DTOs Completos

### 3.1 Submit NF-e — Request

```typescript
// src/modules/api-gateway/dto/submit-nf.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NfSource } from '../../../common/enums/nf-source.enum';

export class SubmitNfDto {
  @ApiProperty({
    description: 'Conteúdo XML completo da NF-e (encoding UTF-8)',
    example: '<?xml version="1.0" encoding="UTF-8"?><nfeProc>...</nfeProc>',
    maxLength: 5242880, // 5MB
  })
  @IsString()
  @IsNotEmpty({ message: 'xmlContent é obrigatório' })
  @MaxLength(5242880, { message: 'XML não pode exceder 5MB' })
  xmlContent: string;

  @ApiPropertyOptional({
    description: 'Origem da NF-e',
    enum: NfSource,
    default: NfSource.API,
  })
  @IsOptional()
  @IsEnum(NfSource, { message: 'source deve ser API, EMAIL ou S3' })
  source?: NfSource;

  @ApiPropertyOptional({
    description: 'Metadados adicionais em formato livre',
    example: { clientId: 'erp-001', batchId: 'batch-2024-01' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}
```

### 3.2 Submit NF-e — Response (202)

```typescript
// src/modules/api-gateway/dto/nf-submit-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class NfSubmitResponseDto {
  @ApiProperty({ example: 202 })
  statusCode: number;

  @ApiProperty({ example: 'NF-e aceita para processamento' })
  message: string;

  @ApiProperty({
    example: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      chaveAcesso: '35240112345678000195550010000001231234567890',
      idempotencyKey: 'a3f5c7e9...',
      status: 'RECEIVED',
      alreadyProcessed: false,
    },
  })
  data: {
    id: string;
    chaveAcesso: string;
    idempotencyKey: string;
    status: string;
    alreadyProcessed: boolean;
  };
}
```

### 3.3 Query NF-e — Request

```typescript
// src/modules/api-gateway/dto/query-nf.dto.ts
import { IsOptional, IsEnum, IsDateString, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NfStatus } from '../../../common/enums/nf-status.enum';
import { NfSource } from '../../../common/enums/nf-source.enum';

export class QueryNfDto {
  @ApiPropertyOptional({ enum: NfStatus })
  @IsOptional()
  @IsEnum(NfStatus)
  status?: NfStatus;

  @ApiPropertyOptional({ enum: NfSource })
  @IsOptional()
  @IsEnum(NfSource)
  source?: NfSource;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @ApiPropertyOptional({ example: '2024-01-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  dataFim?: string;

  @ApiPropertyOptional({ example: '12345678000195' })
  @IsOptional()
  @IsString()
  cnpjEmitente?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

### 3.4 NF-e Detail — Response

```typescript
// src/modules/api-gateway/dto/nf-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class NfDetailResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({
    example: {
      id: 'uuid',
      chaveAcesso: '35240112345678000195550010000001231234567890',
      numero: 123,
      serie: 1,
      modelo: '55',
      dataEmissao: '2024-01-15T00:00:00.000Z',
      naturezaOperacao: 'Venda de mercadoria',
      valorTotalNf: 1500.00,
      status: 'COMPLETED',
      source: 'API',
      emitente: {
        cnpj: '12345678000195',
        razaoSocial: 'Empresa Emitente LTDA',
        uf: 'SP',
      },
      destinatario: {
        cnpj: '98765432000100',
        razaoSocial: 'Empresa Destinatária SA',
      },
      itens: [
        {
          numeroItem: 1,
          descricao: 'Produto XYZ',
          quantidade: 10,
          valorUnitario: 150.00,
          valorTotal: 1500.00,
        },
      ],
    },
  })
  data: Record<string, any>;
}
```

### 3.5 Lista NF-e — Response

```typescript
// src/modules/api-gateway/dto/nf-list-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class PaginationDto {
  @ApiProperty({ example: 150 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 8 })
  totalPages: number;
}

export class NfListResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ type: [Object] })
  data: Record<string, any>[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}
```

---

## 4. Response Wrapper Padrão

```typescript
// src/common/dtos/base-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BaseResponseDto<T = any> {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiPropertyOptional({ example: 'Operação realizada com sucesso' })
  message?: string;

  @ApiPropertyOptional()
  data?: T;

  @ApiPropertyOptional({
    example: { total: 100, page: 1, limit: 20, totalPages: 5 },
  })
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

---

## 5. Códigos de Erro

```typescript
// src/common/constants/error-codes.constants.ts
export const ERROR_CODES = {
  // Validação de entrada (400)
  INVALID_XML_FORMAT: { code: 'NF_400_001', message: 'Formato XML inválido', httpStatus: 400 },
  MISSING_CHAVE_ACESSO: { code: 'NF_400_002', message: 'Chave de acesso não encontrada no XML', httpStatus: 400 },
  XML_TOO_LARGE: { code: 'NF_400_003', message: 'XML excede tamanho máximo permitido (5MB)', httpStatus: 400 },
  INVALID_QUERY_PARAMS: { code: 'NF_400_004', message: 'Parâmetros de consulta inválidos', httpStatus: 400 },

  // Autenticação/Autorização (401/403)
  UNAUTHORIZED: { code: 'NF_401_001', message: 'Token JWT ausente ou inválido', httpStatus: 401 },
  FORBIDDEN: { code: 'NF_403_001', message: 'Permissão insuficiente', httpStatus: 403 },

  // Não encontrado (404)
  NF_NOT_FOUND: { code: 'NF_404_001', message: 'NF-e não encontrada', httpStatus: 404 },

  // Processamento (422)
  XML_XSD_VALIDATION_FAILED: { code: 'NF_422_001', message: 'XML não passou validação XSD', httpStatus: 422 },
  BUSINESS_VALIDATION_FAILED: { code: 'NF_422_002', message: 'Validação de negócio falhou', httpStatus: 422 },
  CNPJ_EMITENTE_INATIVO: { code: 'NF_422_003', message: 'CNPJ do emitente inativo', httpStatus: 422 },
  SEFAZ_NF_NAO_AUTORIZADA: { code: 'NF_422_004', message: 'NF não autorizada na SEFAZ', httpStatus: 422 },

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: { code: 'NF_429_001', message: 'Limite de requisições excedido', httpStatus: 429 },

  // Erro interno (500)
  INTERNAL_ERROR: { code: 'NF_500_001', message: 'Erro interno do servidor', httpStatus: 500 },
  DATABASE_ERROR: { code: 'NF_500_002', message: 'Erro de banco de dados', httpStatus: 500 },
  MESSAGING_ERROR: { code: 'NF_500_003', message: 'Erro de mensageria', httpStatus: 500 },

  // Serviço indisponível (503)
  SEFAZ_UNAVAILABLE: { code: 'NF_503_001', message: 'Serviço SEFAZ indisponível', httpStatus: 503 },
  RECEITA_WS_UNAVAILABLE: { code: 'NF_503_002', message: 'Serviço ReceitaWS indisponível', httpStatus: 503 },
} as const;
```

---

## 6. Global Exception Filter

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
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro interno do servidor';
    let errorCode = 'NF_500_001';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        errorCode = (exceptionResponse as any).errorCode || `NF_${status}_000`;
        details = (exceptionResponse as any).details;
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log do erro
    this.logger.error(
      `${request.method} ${request.url} — ${status} — ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      errorCode,
      message: Array.isArray(message) ? message : [message],
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

---

## 7. Rate Limiting

```typescript
// No main.ts ou no AppModule:
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 segundo
        limit: 10,  // 10 req/s
      },
      {
        name: 'medium',
        ttl: 60000, // 1 minuto
        limit: 100,  // 100 req/min
      },
    ]),
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

## 8. Swagger Setup

```typescript
// No main.ts
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('NF-e Processor API')
    .setDescription('API para processamento de Notas Fiscais Eletrônicas')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Insira o token JWT',
      },
      'access-token',
    )
    .addTag('Notas Fiscais', 'Operações com NF-e')
    .addTag('Health', 'Health checks da aplicação')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(3000);
}
```

---

## 9. Exemplos de Request/Response

### 9.1 POST /api/v1/nf — Sucesso (202)

**Request:**
```http
POST /api/v1/nf HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "xmlContent": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><nfeProc xmlns=\"http://www.portalfiscal.inf.br/nfe\" versao=\"4.00\"><NFe><infNFe Id=\"NFe35240112345678000195550010000001231234567890\" versao=\"4.00\"><ide><cUF>35</cUF><cNF>12345678</cNF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2024-01-15T10:30:00-03:00</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>12345678000195</CNPJ><xNome>Empresa Emitente LTDA</xNome></emit><dest><CNPJ>98765432000100</CNPJ><xNome>Empresa Destinatária SA</xNome></dest><det nItem=\"1\"><prod><cProd>001</cProd><xProd>Produto XYZ</xProd><NCM>84719012</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>150.0000000000</vUnCom><vProd>1500.00</vProd></prod></det><total><ICMSTot><vProd>1500.00</vProd><vNF>1500.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
  "metadata": { "clientId": "erp-001" }
}
```

**Response (202):**
```json
{
  "statusCode": 202,
  "message": "NF-e aceita para processamento",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "chaveAcesso": "35240112345678000195550010000001231234567890",
    "idempotencyKey": "a3f5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3",
    "status": "RECEIVED",
    "alreadyProcessed": false
  }
}
```

### 9.2 POST /api/v1/nf — Idempotente (200)

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "NF-e já foi recebida anteriormente",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "chaveAcesso": "35240112345678000195550010000001231234567890",
    "idempotencyKey": "a3f5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3",
    "status": "RECEIVED",
    "alreadyProcessed": true
  }
}
```

### 9.3 GET /api/v1/nf?status=COMPLETED&page=1&limit=10

**Response (200):**
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": "uuid-1",
      "chaveAcesso": "35240112345678000195550010000001231234567890",
      "numero": 123,
      "serie": 1,
      "dataEmissao": "2024-01-15T10:30:00.000Z",
      "valorTotalNf": 1500.00,
      "status": "COMPLETED",
      "source": "API",
      "emitente": {
        "cnpj": "12345678000195",
        "razaoSocial": "Empresa Emitente LTDA"
      },
      "destinatario": {
        "cnpj": "98765432000100",
        "razaoSocial": "Empresa Destinatária SA"
      },
      "createdAt": "2024-01-15T13:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

### 9.4 Error Response (400)

```json
{
  "statusCode": 400,
  "errorCode": "NF_400_001",
  "message": ["Formato XML inválido"],
  "timestamp": "2024-01-15T14:00:00.000Z",
  "path": "/api/v1/nf"
}
```

### 9.5 Error Response (401)

```json
{
  "statusCode": 401,
  "errorCode": "NF_401_001",
  "message": ["Token JWT ausente ou inválido"],
  "timestamp": "2024-01-15T14:00:00.000Z",
  "path": "/api/v1/nf"
}
```

### 9.6 Error Response (429)

```json
{
  "statusCode": 429,
  "errorCode": "NF_429_001",
  "message": ["Limite de requisições excedido. Tente novamente em 60 segundos"],
  "timestamp": "2024-01-15T14:00:00.000Z",
  "path": "/api/v1/nf"
}
```
