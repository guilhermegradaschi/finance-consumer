# 02 - Auditoria de Qualidade de Código

## Sumário Executivo

Este documento analisa problemas de código, antipadrões, duplicações e inconsistências no finance-consumer. A análise cobre convenções, type safety, error handling, e práticas de clean code.

---

## Problemas Críticos

### 1. JwtAuthGuard Implementação Manual

**Localização**: `src/common/guards/jwt-auth.guard.ts`

**Problema**: Implementação manual de verificação JWT em vez de usar a estratégia passport-jwt já instalada.

```typescript
// ❌ Atual - Verificação manual vulnerável
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}
  
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    
    if (!token) {
      throw new UnauthorizedException('Token not found');
    }
    
    try {
      // ⚠️ Não valida issuer, audience, algorithm
      // ⚠️ Não verifica token blacklist
      // ⚠️ Não loga tentativas de acesso
      const payload = this.jwtService.verify(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
  
  private extractToken(request: Request): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}
```

**Impacto**:
- Não valida claims obrigatórios (iss, aud, exp)
- Não suporta token refresh/rotation
- Não integra com blacklist para logout
- Logging de segurança ausente

**Solução**:
```typescript
// ✅ Usar passport-jwt strategy
// src/common/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from '../services/token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      issuer: configService.get<string>('JWT_ISSUER'),
      audience: configService.get<string>('JWT_AUDIENCE'),
      algorithms: ['HS256'], // Explicitamente definir algoritmo
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    // Verificar blacklist
    const isBlacklisted = await this.tokenBlacklist.isBlacklisted(payload.jti);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }
    
    // Log de acesso
    this.logger.log(`User ${payload.sub} accessed with token ${payload.jti}`);
    
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
  }
}

// src/common/guards/jwt-auth.guard.ts - Simplificado
import { AuthGuard } from '@nestjs/passport';
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

---

### 2. Decimal Transformer com Perda de Precisão

**Localização**: `src/modules/persistence/entities/*.ts`

**Problema**: Transformer converte decimal para number JavaScript, causando perda de precisão em valores financeiros.

```typescript
// ❌ Atual - Perda de precisão
export const decimalTransformer: ValueTransformer = {
  to: (value: number): string => value?.toString(),
  from: (value: string): number => parseFloat(value), // ⚠️ Precision loss!
};

@Entity('nf_documents')
export class NfDocument {
  @Column({ 
    type: 'decimal', 
    precision: 15, 
    scale: 4,
    transformer: decimalTransformer 
  })
  totalValue: number; // Deveria ser Decimal!
}
```

**Evidência do problema**:
```javascript
// JavaScript float precision issue
0.1 + 0.2 // 0.30000000000000004
parseFloat('12345678901234.5678') // 12345678901234.568 (precision loss)
```

**Impacto**:
- Diferenças de centavos em notas fiscais
- Falha em reconciliação contábil
- Possíveis problemas legais/fiscais

**Solução**:
```typescript
// ✅ Usar biblioteca Decimal.js
import { Decimal } from 'decimal.js';

export const decimalTransformer: ValueTransformer = {
  to: (value: Decimal | null): string | null => value?.toString() ?? null,
  from: (value: string | null): Decimal | null => value ? new Decimal(value) : null,
};

@Entity('nf_documents')
export class NfDocument {
  @Column({ 
    type: 'decimal', 
    precision: 15, 
    scale: 4,
    transformer: decimalTransformer 
  })
  totalValue: Decimal;
}

// Nos DTOs, converter para string para JSON
export class NfDocumentDto {
  @ApiProperty({ type: String, example: '12345.6789' })
  totalValue: string;
  
  static fromEntity(entity: NfDocument): NfDocumentDto {
    return {
      ...entity,
      totalValue: entity.totalValue.toString(),
    };
  }
}
```

---

### 3. Falta de Validação XSD

**Localização**: `src/modules/xml-processor/xml-processor.service.ts`

**Problema**: Documentação menciona validação XSD, mas não está implementada. XMLs malformados passam pelo pipeline.

```typescript
// ❌ Atual - Apenas parse sem validação
@Injectable()
export class XmlProcessorService {
  async process(xmlContent: string): Promise<ParsedNf> {
    // Parse básico sem validação de schema
    const parsed = await this.parseXml(xmlContent);
    
    // Extrai dados sem garantia de estrutura
    return {
      chaveAcesso: parsed.NFe?.infNFe?.$?.Id?.replace('NFe', ''),
      // ⚠️ Se estrutura diferente, retorna undefined silenciosamente
    };
  }
}
```

**Impacto**:
- XMLs inválidos são aceitos e persistidos
- Dados ausentes/incorretos não detectados
- Falhas silenciosas no pipeline

**Solução**:
```typescript
// ✅ Implementar validação XSD com libxmljs2
import { parseXml, Document } from 'libxmljs2';
import { readFileSync } from 'fs';

@Injectable()
export class XmlValidatorService {
  private readonly xsdDoc: Document;
  
  constructor() {
    const xsdContent = readFileSync('src/schemas/nfe_v4.00.xsd', 'utf-8');
    this.xsdDoc = parseXml(xsdContent);
  }
  
  validate(xmlContent: string): ValidationResult {
    try {
      const xmlDoc = parseXml(xmlContent);
      const isValid = xmlDoc.validate(this.xsdDoc);
      
      if (!isValid) {
        const errors = xmlDoc.validationErrors.map(e => ({
          line: e.line,
          column: e.column,
          message: e.message,
        }));
        return { valid: false, errors };
      }
      
      return { valid: true, errors: [] };
    } catch (error) {
      return { 
        valid: false, 
        errors: [{ message: `XML parse error: ${error.message}` }] 
      };
    }
  }
}

// No XmlProcessorService
async process(xmlContent: string): Promise<ParsedNf> {
  // 1. Validar schema XSD
  const validation = this.xmlValidator.validate(xmlContent);
  if (!validation.valid) {
    throw new XmlValidationException(validation.errors);
  }
  
  // 2. Parse seguro
  const parsed = await this.parseXml(xmlContent);
  
  // 3. Extrair dados com garantia de estrutura
  return this.extractNfData(parsed);
}
```

---

## Antipadrões Identificados

### 4. Repository Pattern Desnecessário

**Localização**: `src/modules/persistence/repositories/`

**Problema**: Repositories custom que apenas wrappam TypeORM Repository sem adicionar valor.

```typescript
// ❌ Atual - Repository que não faz nada além do TypeORM
@Injectable()
export class NfDocumentRepository {
  constructor(
    @InjectRepository(NfDocumentEntity)
    private readonly repository: Repository<NfDocumentEntity>,
  ) {}
  
  async findById(id: string): Promise<NfDocumentEntity | null> {
    return this.repository.findOne({ where: { id } });
  }
  
  async save(entity: NfDocumentEntity): Promise<NfDocumentEntity> {
    return this.repository.save(entity);
  }
  
  async findByChaveAcesso(chave: string): Promise<NfDocumentEntity | null> {
    return this.repository.findOne({ where: { chaveAcesso: chave } });
  }
}
```

**Impacto**:
- Código boilerplate desnecessário
- Manutenção adicional sem benefício
- Abstração prematura

**Solução**:

**Opção A - Usar TypeORM Repository diretamente:**
```typescript
// Para queries simples, injetar diretamente
@Injectable()
export class PersistenceService {
  constructor(
    @InjectRepository(NfDocumentEntity)
    private readonly nfRepository: Repository<NfDocumentEntity>,
  ) {}
  
  async findById(id: string): Promise<NfDocumentEntity | null> {
    return this.nfRepository.findOne({ where: { id } });
  }
}
```

**Opção B - Custom Repository com valor real:**
```typescript
// Se precisar de queries complexas, usar Repository Extension
@Injectable()
export class NfDocumentRepository extends Repository<NfDocumentEntity> {
  constructor(private dataSource: DataSource) {
    super(NfDocumentEntity, dataSource.createEntityManager());
  }
  
  // Apenas métodos que agregam valor
  async findPendingProcessing(limit: number): Promise<NfDocumentEntity[]> {
    return this.createQueryBuilder('nf')
      .where('nf.status IN (:...statuses)', { 
        statuses: [NfStatus.RECEIVED, NfStatus.RETRY] 
      })
      .andWhere('nf.retryCount < :maxRetries', { maxRetries: 3 })
      .orderBy('nf.createdAt', 'ASC')
      .limit(limit)
      .getMany();
  }
  
  async getStatisticsByPeriod(start: Date, end: Date): Promise<NfStatistics> {
    return this.createQueryBuilder('nf')
      .select('nf.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(nf.totalValue)', 'totalValue')
      .where('nf.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('nf.status')
      .getRawMany();
  }
}
```

---

### 5. Exception Handling Inconsistente

**Localização**: `src/common/exceptions/`, consumers

**Problema**: Mix de exception types, catch genéricos, e falta de contexto nos errors.

```typescript
// ❌ Problemas diversos

// 1. Exceções sem contexto
throw new Error('Failed to process'); // Não diz o quê ou por quê

// 2. Catch genérico demais
try {
  await this.process(data);
} catch (error) {
  // Trata tudo igual - retry em erros não-retryable
  await this.retry(data);
}

// 3. Exceptions customizadas não padronizadas
class XmlParseException extends Error {} // Falta httpCode, errorCode
class ValidationError extends Error {}    // Naming inconsistente
class NfNotFoundException {}              // Extends Object, não Error!
```

**Solução**:
```typescript
// ✅ Hierarquia de exceções padronizada
// src/common/exceptions/base.exception.ts
export abstract class BaseException extends Error {
  abstract readonly httpStatusCode: number;
  abstract readonly errorCode: string;
  abstract readonly isRetryable: boolean;
  
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
  
  toJSON() {
    return {
      error: this.errorCode,
      message: this.message,
      context: this.context,
      timestamp: new Date().toISOString(),
    };
  }
}

// src/common/exceptions/retryable.exception.ts
export abstract class RetryableException extends BaseException {
  readonly isRetryable = true;
}

// src/common/exceptions/non-retryable.exception.ts
export abstract class NonRetryableException extends BaseException {
  readonly isRetryable = false;
}

// src/common/exceptions/domain/
export class NfNotFoundException extends NonRetryableException {
  readonly httpStatusCode = 404;
  readonly errorCode = 'NF_NOT_FOUND';
  
  constructor(id: string) {
    super(`NF with id ${id} not found`, { nfId: id });
  }
}

export class XmlValidationException extends NonRetryableException {
  readonly httpStatusCode = 400;
  readonly errorCode = 'XML_VALIDATION_FAILED';
  
  constructor(errors: ValidationError[]) {
    super('XML validation failed', { errors });
  }
}

export class ExternalServiceException extends RetryableException {
  readonly httpStatusCode = 503;
  readonly errorCode = 'EXTERNAL_SERVICE_ERROR';
  
  constructor(service: string, cause: Error) {
    super(`External service ${service} failed`, { service }, cause);
  }
}
```

---

### 6. Magic Strings e Números

**Localização**: Espalhado pelo código

**Problema**: Valores hardcoded sem constantes, dificultando manutenção e gerando inconsistências.

```typescript
// ❌ Magic strings/numbers espalhados

// Em diferentes arquivos:
channel.assertQueue('nf.received');     // rabbitmq.service.ts
await this.publish('nf.received', msg); // nf-receiver.service.ts
const QUEUE = 'nf.recieved';            // consumer.ts (TYPO!)

// Timeouts inconsistentes
await this.http.get(url, { timeout: 5000 });  // client1.ts
await this.http.get(url, { timeout: 10000 }); // client2.ts
await this.http.get(url, { timeout: 3000 });  // client3.ts

// Status strings
nf.status = 'PROCESSING';     // service1.ts
nf.status = 'processing';     // service2.ts (case diferente!)
nf.status = 'IN_PROCESSING';  // service3.ts (nome diferente!)
```

**Solução**:
```typescript
// ✅ Constantes centralizadas
// src/common/constants/queues.ts
export const QUEUES = {
  NF_RECEIVED: 'nf.received',
  NF_RECEIVED_DLQ: 'nf.received.dlq',
  NF_PARSED: 'nf.parsed',
  NF_PARSED_DLQ: 'nf.parsed.dlq',
  NF_VALIDATED: 'nf.validated',
  NF_VALIDATED_DLQ: 'nf.validated.dlq',
  NF_COMPLETED: 'nf.completed',
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];

// src/common/constants/timeouts.ts
export const TIMEOUTS = {
  HTTP_DEFAULT: 5000,
  HTTP_SEFAZ: 10000,
  HTTP_RECEITA: 5000,
  REDIS_OPERATION: 1000,
  DB_QUERY: 30000,
} as const;

// src/common/enums/nf-status.enum.ts
export enum NfStatus {
  RECEIVED = 'RECEIVED',
  PARSING = 'PARSING',
  PARSED = 'PARSED',
  VALIDATING = 'VALIDATING',
  VALIDATED = 'VALIDATED',
  PERSISTING = 'PERSISTING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  DLQ = 'DLQ',
}

// Uso
import { QUEUES } from '@common/constants/queues';
import { TIMEOUTS } from '@common/constants/timeouts';
import { NfStatus } from '@common/enums/nf-status.enum';

channel.assertQueue(QUEUES.NF_RECEIVED);
await this.http.get(url, { timeout: TIMEOUTS.HTTP_SEFAZ });
nf.status = NfStatus.PROCESSING;
```

---

## Duplicação de Código

### 7. Consumer Boilerplate

**Localização**: `src/modules/*/consumers/*.consumer.ts`

**Análise de duplicação**:

```typescript
// ~80 linhas repetidas em cada consumer

// XmlProcessorConsumer
async handleMessage(msg: ConsumeMessage) {
  const correlationId = msg.properties.correlationId;
  const startTime = Date.now();
  this.logger.log(`Processing message ${correlationId}`);
  
  try {
    const data = JSON.parse(msg.content.toString());
    await this.xmlProcessorService.process(data);
    this.channel.ack(msg);
    this.logger.log(`Processed ${correlationId} in ${Date.now() - startTime}ms`);
  } catch (error) {
    this.logger.error(`Error processing ${correlationId}`, error.stack);
    const retryCount = this.getRetryCount(msg);
    if (error instanceof RetryableException && retryCount < this.maxRetries) {
      await this.publishWithDelay(msg.content, retryCount + 1);
      this.channel.ack(msg);
    } else {
      await this.sendToDlq(msg, error);
      this.channel.ack(msg);
    }
  }
}

// BusinessValidatorConsumer - MESMO CÓDIGO
async handleMessage(msg: ConsumeMessage) {
  const correlationId = msg.properties.correlationId;
  const startTime = Date.now();
  this.logger.log(`Processing message ${correlationId}`);
  // ... idêntico
}

// PersistenceConsumer - MESMO CÓDIGO
async handleMessage(msg: ConsumeMessage) {
  // ... idêntico
}
```

**Métricas**:
- ~240 linhas duplicadas (3 consumers × 80 linhas)
- 3 lugares para corrigir bugs
- Inconsistências já existentes (timeouts diferentes)

**Solução**: Ver `01-architecture-audit.md` seção "Consumer Duplicação de Lógica".

---

### 8. DTO Validation Boilerplate

**Localização**: `src/modules/*/dtos/*.dto.ts`

**Problema**: Validações repetidas em DTOs similares.

```typescript
// ❌ Duplicação em múltiplos DTOs
export class CreateNfDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(44)
  @Matches(/^[0-9]{44}$/)
  chaveAcesso: string;
  
  @IsString()
  @IsNotEmpty()
  @MaxLength(14)
  @Matches(/^[0-9]{14}$/)
  cnpjEmitente: string;
}

export class ReprocessNfDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(44)
  @Matches(/^[0-9]{44}$/)
  chaveAcesso: string;  // Duplicado!
}

export class QueryNfDto {
  @IsOptional()
  @IsString()
  @MaxLength(14)
  @Matches(/^[0-9]{14}$/)
  cnpjEmitente?: string;  // Quase duplicado!
}
```

**Solução**:
```typescript
// ✅ Validadores customizados reutilizáveis
// src/common/validators/nf-validators.ts
import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsChaveAcesso(options?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isChaveAcesso',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Chave de acesso deve conter 44 dígitos numéricos',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && /^[0-9]{44}$/.test(value);
        },
      },
    });
  };
}

export function IsCnpj(options?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isCnpj',
      target: object.constructor,
      propertyName,
      options: {
        message: 'CNPJ deve conter 14 dígitos numéricos',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          if (!/^[0-9]{14}$/.test(value)) return false;
          return validateCnpjChecksum(value); // Validação de dígitos verificadores
        },
      },
    });
  };
}

// Uso limpo
export class CreateNfDto {
  @IsChaveAcesso()
  chaveAcesso: string;
  
  @IsCnpj()
  cnpjEmitente: string;
}

export class QueryNfDto {
  @IsOptional()
  @IsCnpj()
  cnpjEmitente?: string;
}
```

---

## Complexidade Excessiva

### 9. RabbitMQ Service Monolítico

**Localização**: `src/infrastructure/rabbitmq/rabbitmq.service.ts`

**Problema**: Service com múltiplas responsabilidades e estado complexo.

```typescript
// ❌ Service com muitas responsabilidades
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private connection: Connection;
  private channel: Channel;
  private consumers: Map<string, Consumer> = new Map();
  private isConnected = false;
  private reconnectAttempts = 0;
  
  async onModuleInit() {
    await this.connect();
    await this.assertQueues();
    await this.setupConsumers();
    await this.setupExchanges();
    await this.bindQueues();
    this.setupEventHandlers();
  }
  
  async connect() { /* 50 linhas */ }
  async reconnect() { /* 30 linhas */ }
  async assertQueues() { /* 40 linhas */ }
  async setupConsumers() { /* 60 linhas */ }
  async publish() { /* 20 linhas */ }
  async publishWithDelay() { /* 25 linhas */ }
  async sendToDlq() { /* 15 linhas */ }
  // ... mais 200 linhas
}
```

**Métricas**:
- ~400 linhas em um único arquivo
- 15+ métodos públicos
- Estado complexo com múltiplas variáveis de instância

**Solução**:
```typescript
// ✅ Separar responsabilidades
// src/infrastructure/rabbitmq/connection.manager.ts
@Injectable()
export class RabbitMqConnectionManager {
  private connection: Connection | null = null;
  
  async connect(): Promise<Connection> { ... }
  async disconnect(): Promise<void> { ... }
  isConnected(): boolean { ... }
}

// src/infrastructure/rabbitmq/channel.manager.ts
@Injectable()
export class RabbitMqChannelManager {
  async createChannel(connection: Connection): Promise<Channel> { ... }
  async assertQueues(channel: Channel, queues: QueueConfig[]): Promise<void> { ... }
}

// src/infrastructure/rabbitmq/publisher.ts
@Injectable()
export class RabbitMqPublisher {
  async publish(queue: QueueName, message: unknown, options?: PublishOptions): Promise<void> { ... }
  async publishWithDelay(queue: QueueName, message: unknown, delay: number): Promise<void> { ... }
}

// src/infrastructure/rabbitmq/consumer.registry.ts
@Injectable()
export class RabbitMqConsumerRegistry {
  register(queue: QueueName, handler: MessageHandler): void { ... }
  start(): Promise<void> { ... }
  stop(): Promise<void> { ... }
}

// src/infrastructure/rabbitmq/rabbitmq.module.ts
@Module({
  providers: [
    RabbitMqConnectionManager,
    RabbitMqChannelManager,
    RabbitMqPublisher,
    RabbitMqConsumerRegistry,
  ],
  exports: [RabbitMqPublisher, RabbitMqConsumerRegistry],
})
export class RabbitMqModule {}
```

---

## Type Safety Issues

### 10. Any Types e Type Assertions

**Localização**: Espalhado

```typescript
// ❌ Problemas de type safety

// Any explícito
async parseXml(content: string): Promise<any> {
  return xml2js.parseStringPromise(content);
}

// Type assertion perigoso
const nf = result as NfDocument; // E se result for null?

// Implicit any
function process(data) {  // Parâmetro sem tipo
  return data.value * 2;
}

// Non-null assertion
const user = request.user!;  // E se não existir?
```

**Solução**:
```typescript
// ✅ Type safety rigoroso

// Tipos explícitos para XML
interface ParsedNfeXml {
  NFe: {
    infNFe: {
      $: { Id: string };
      ide: NfeIde;
      emit: NfeEmitente;
      dest: NfeDestinatario;
      det: NfeItem[];
      total: NfeTotal;
    };
  };
}

async parseXml(content: string): Promise<ParsedNfeXml> {
  const result = await xml2js.parseStringPromise(content);
  return this.validateAndCast<ParsedNfeXml>(result);
}

// Type guards
function isNfDocument(value: unknown): value is NfDocument {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'chaveAcesso' in value
  );
}

// Null checks adequados
const user = request.user;
if (!user) {
  throw new UnauthorizedException('User not found in request');
}

// Strict function signatures
function process(data: ProcessableData): ProcessResult {
  return { value: data.value * 2 };
}
```

---

## Inconsistências de Estilo

### 11. Naming Conventions

| Tipo | Padrões Encontrados | Padrão Correto |
|------|---------------------|----------------|
| Classes | `NfReceiverService`, `nfReceiver` | PascalCase |
| Métodos | `processNf`, `process_nf`, `ProcessNf` | camelCase |
| Constantes | `MAX_RETRIES`, `maxRetries`, `MaxRetries` | UPPER_SNAKE_CASE |
| Arquivos | `nf-receiver.service.ts`, `NfReceiver.service.ts` | kebab-case |
| Interfaces | `INfRepository`, `NfRepositoryInterface`, `NfRepository` | `I` prefix ou sem |

### 12. Import Organization

```typescript
// ❌ Imports desorganizados
import { NfDocument } from '../persistence/entities/nf-document.entity';
import { Injectable } from '@nestjs/common';
import { QUEUES } from '../../common/constants/queues';
import * as xml2js from 'xml2js';
import { Logger } from '@nestjs/common';
import { RabbitMqService } from '../../infrastructure/rabbitmq/rabbitmq.service';

// ✅ Imports organizados
// 1. Node.js built-ins
import { readFileSync } from 'fs';

// 2. External packages
import { Injectable, Logger } from '@nestjs/common';
import * as xml2js from 'xml2js';

// 3. Internal - infrastructure
import { RabbitMqService } from '@infrastructure/rabbitmq/rabbitmq.service';

// 4. Internal - common
import { QUEUES } from '@common/constants/queues';

// 5. Internal - same module or relative
import { NfDocument } from '../persistence/entities/nf-document.entity';
```

---

## Checklist de Correções

### Alta Prioridade

- [ ] Migrar JwtAuthGuard para passport-jwt strategy
- [ ] Implementar Decimal.js para valores financeiros
- [ ] Adicionar validação XSD
- [ ] Criar BaseConsumer para eliminar duplicação
- [ ] Padronizar exception handling

### Média Prioridade

- [ ] Centralizar constantes (queues, timeouts, status)
- [ ] Criar validadores customizados reutilizáveis
- [ ] Refatorar RabbitMqService em componentes menores
- [ ] Eliminar any types

### Baixa Prioridade

- [ ] Padronizar naming conventions
- [ ] Organizar imports
- [ ] Remover repositories sem valor agregado
- [ ] Adicionar JSDoc em interfaces públicas

---

## Métricas de Qualidade

| Métrica | Atual | Alvo | Ferramenta |
|---------|-------|------|------------|
| Cobertura de testes | 70-80% | 85%+ | Jest |
| Duplicação de código | ~15% | <5% | SonarQube |
| Complexidade ciclomática | 12 avg | <10 | ESLint |
| Cognitive complexity | 18 avg | <15 | SonarQube |
| Type coverage | ~85% | 99%+ | typescript-coverage |
| Any usage | ~50 ocorrências | 0 | ESLint no-explicit-any |

---

## ESLint Rules Recomendadas

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict',
    'plugin:@typescript-eslint/stylistic',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    'no-magic-numbers': ['error', { ignore: [0, 1, -1] }],
    'max-lines-per-function': ['error', { max: 50 }],
    'complexity': ['error', { max: 10 }],
  },
};
```
