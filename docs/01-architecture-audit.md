# 01 - Auditoria de Arquitetura

## Visão Geral da Arquitetura Atual

O finance-consumer implementa uma arquitetura **event-driven** com padrão **pipes and filters**, onde cada estágio do pipeline é desacoplado via RabbitMQ. A arquitetura segue parcialmente os princípios de Clean Architecture do NestJS, mas com violações significativas.

---

## Diagrama de Contexto (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SISTEMA EXTERNO                                │
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   ERP/SAP    │     │   Portal     │     │   Mobile     │                │
│  │   Cliente    │     │   Fornecedor │     │     App      │                │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘                │
│         │                    │                    │                         │
│         └────────────────────┼────────────────────┘                         │
│                              │ HTTPS/JWT                                    │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FINANCE-CONSUMER                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        API Gateway (NestJS)                            │ │
│  │   • Autenticação JWT    • Rate Limiting    • Validação de Entrada     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      Processing Pipeline                               │ │
│  │   NfReceiver → XmlProcessor → BusinessValidator → Persistence         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
         │              │               │                │
         ▼              ▼               ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  RabbitMQ   │  │    Redis    │  │ PostgreSQL  │  │  S3/MinIO   │
│  (Broker)   │  │   (Cache)   │  │    (DB)     │  │  (Storage)  │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
                                         │
                               ┌─────────┴─────────┐
                               ▼                   ▼
                        ┌─────────────┐     ┌─────────────┐
                        │   SEFAZ     │     │  Receita    │
                        │  (MOCK!)    │     │     WS      │
                        └─────────────┘     └─────────────┘
```

---

## Análise de Camadas

### Estrutura de Camadas Atual

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  src/modules/api-gateway/controllers/                        │
│  • HealthController                                          │
│  • NfController                                              │
│  • ReprocessController                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  src/modules/*/services/                                     │
│  • NfReceiverService                                         │
│  • XmlProcessorService                                       │
│  • BusinessValidatorService                                  │
│  • PersistenceService                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                            │
│  src/modules/persistence/entities/                           │
│  • NfDocument                                                │
│  • NfItem                                                    │
│  • NfEvent                                                   │
│  (⚠️ Entities com lógica de infraestrutura - TypeORM)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER                        │
│  src/infrastructure/                                         │
│  • database/    (TypeORM)                                    │
│  • rabbitmq/    (amqplib)                                    │
│  • redis/       (ioredis)                                    │
│  • s3/          (AWS SDK)                                    │
│  • observability/                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Problemas Arquiteturais Identificados

### 1. Violação de Limites de Domínio

**Problema**: Entities de domínio (`NfDocument`, `NfItem`) contêm decorators TypeORM, acoplando domínio à infraestrutura.

**Localização**: `src/modules/persistence/entities/`

**Evidência**:
```typescript
// ❌ Atual - Entity acoplada ao TypeORM
@Entity('nf_documents')
export class NfDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'decimal', transformer: decimalTransformer })
  totalValue: number;
  
  @OneToMany(() => NfItem, item => item.document)
  items: NfItem[];
}
```

**Impacto**: 
- Impossível testar domínio sem mock do TypeORM
- Mudança de ORM requer reescrever domínio
- Lógica de negócio misturada com persistência

**Solução Proposta**:
```typescript
// ✅ Proposto - Domain Entity pura
// src/domain/entities/nf-document.entity.ts
export class NfDocument {
  constructor(
    public readonly id: string,
    public readonly chaveAcesso: string,
    public readonly totalValue: Decimal,
    public readonly items: NfItem[],
  ) {}
  
  public validate(): ValidationResult { ... }
  public calculateTotals(): void { ... }
}

// src/infrastructure/persistence/typeorm/nf-document.orm-entity.ts
@Entity('nf_documents')
export class NfDocumentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  // ... mapping TypeORM
}

// src/infrastructure/persistence/mappers/nf-document.mapper.ts
export class NfDocumentMapper {
  static toDomain(orm: NfDocumentOrmEntity): NfDocument { ... }
  static toOrm(domain: NfDocument): NfDocumentOrmEntity { ... }
}
```

---

### 2. Circuit Breaker Inconsistente

**Problema**: `ReceitaWsClient` usa opossum corretamente, mas `SefazClient` implementa circuit breaker manual incompleto.

**Localização**: 
- `src/modules/business-validator/clients/receita-ws.client.ts` ✅
- `src/modules/business-validator/clients/sefaz.client.ts` ❌

**Evidência**:
```typescript
// ❌ SefazClient - Circuit breaker manual incompleto
export class SefazClient {
  private failureCount = 0;
  private isOpen = false;
  
  async consultarNfe(chaveAcesso: string): Promise<SefazResponse> {
    if (this.isOpen) {
      throw new Error('Circuit breaker open');
    }
    // Falta: timeout para reset, half-open state, métricas
    return { status: 'AUTORIZADA' }; // MOCK!
  }
}

// ✅ ReceitaWsClient - Usa opossum corretamente
export class ReceitaWsClient {
  private circuitBreaker: CircuitBreaker;
  
  constructor() {
    this.circuitBreaker = new CircuitBreaker(this.consultarCnpj, {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });
  }
}
```

**Impacto**:
- SefazClient não tem proteção real contra falhas em cascata
- Comportamento inconsistente entre clients
- Quando SEFAZ real for implementado, pode derrubar o serviço

**Solução Proposta**:
```typescript
// src/infrastructure/http/circuit-breaker.factory.ts
@Injectable()
export class CircuitBreakerFactory {
  create<T>(fn: (...args: any[]) => Promise<T>, options: Partial<CircuitBreakerOptions>): CircuitBreaker<T> {
    const defaults: CircuitBreakerOptions = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 10,
    };
    return new CircuitBreaker(fn, { ...defaults, ...options });
  }
}

// Uso consistente em todos os clients
@Injectable()
export class SefazClient {
  private readonly cb: CircuitBreaker;
  
  constructor(
    private readonly httpService: HttpService,
    private readonly cbFactory: CircuitBreakerFactory,
  ) {
    this.cb = this.cbFactory.create(
      this.doConsultarNfe.bind(this),
      { timeout: 10000, resetTimeout: 60000 }
    );
  }
}
```

---

### 3. Consumer Duplicação de Lógica

**Problema**: Cada consumer (`XmlProcessorConsumer`, `BusinessValidatorConsumer`, `PersistenceConsumer`) reimplementa a mesma lógica de retry, DLQ e error handling.

**Localização**: `src/modules/*/consumers/`

**Evidência**:
```typescript
// Padrão repetido em TODOS os consumers:
@Injectable()
export class XmlProcessorConsumer {
  async handleMessage(msg: ConsumeMessage) {
    try {
      const data = JSON.parse(msg.content.toString());
      await this.process(data);
      this.channel.ack(msg);
    } catch (error) {
      if (this.isRetryable(error)) {
        const retryCount = this.getRetryCount(msg);
        if (retryCount < 3) {
          this.channel.nack(msg, false, false);
          await this.publishWithDelay(data, retryCount + 1);
        } else {
          await this.sendToDlq(msg);
          this.channel.ack(msg);
        }
      } else {
        await this.sendToDlq(msg);
        this.channel.ack(msg);
      }
    }
  }
}
```

**Impacto**:
- ~150 linhas duplicadas entre consumers
- Bugs corrigidos em um lugar não são propagados
- Difícil adicionar novos comportamentos (tracing, métricas)

**Solução Proposta**:
```typescript
// src/infrastructure/rabbitmq/base-consumer.ts
@Injectable()
export abstract class BaseConsumer<T> {
  protected abstract readonly queueName: string;
  protected abstract readonly dlqName: string;
  protected readonly maxRetries = 3;
  
  protected abstract process(data: T): Promise<void>;
  protected abstract isRetryable(error: Error): boolean;
  
  async handleMessage(msg: ConsumeMessage): Promise<void> {
    const span = this.tracer.startSpan(`consume:${this.queueName}`);
    try {
      const data = this.parseMessage<T>(msg);
      await this.process(data);
      this.metrics.increment(`${this.queueName}.success`);
      this.channel.ack(msg);
    } catch (error) {
      await this.handleError(msg, error);
    } finally {
      span.end();
    }
  }
  
  private async handleError(msg: ConsumeMessage, error: Error): Promise<void> {
    this.metrics.increment(`${this.queueName}.error`);
    const retryCount = this.getRetryCount(msg);
    
    if (this.isRetryable(error) && retryCount < this.maxRetries) {
      await this.retryWithBackoff(msg, retryCount);
    } else {
      await this.sendToDlq(msg, error);
    }
  }
}

// src/modules/xml-processor/consumers/xml-processor.consumer.ts
@Injectable()
export class XmlProcessorConsumer extends BaseConsumer<NfReceivedEvent> {
  protected readonly queueName = 'nf.received';
  protected readonly dlqName = 'nf.received.dlq';
  
  protected async process(data: NfReceivedEvent): Promise<void> {
    await this.xmlProcessorService.process(data);
  }
  
  protected isRetryable(error: Error): boolean {
    return error instanceof RetryableException;
  }
}
```

---

### 4. Acoplamento API Gateway ↔ Domain

**Problema**: Controllers acessam diretamente services de domínio sem camada de application/use-case.

**Localização**: `src/modules/api-gateway/controllers/nf.controller.ts`

**Evidência**:
```typescript
// ❌ Atual - Controller acoplado diretamente ao service
@Controller('api/v1/nf')
export class NfController {
  constructor(
    private readonly nfReceiverService: NfReceiverService,
    private readonly persistenceService: PersistenceService, // Acesso direto!
  ) {}
  
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.persistenceService.findById(id); // Bypass total
  }
}
```

**Impacto**:
- Controller conhece detalhes de implementação
- Impossível adicionar lógica cross-cutting (cache, auditoria) sem modificar controller
- Testes de controller requerem mocks complexos

**Solução Proposta**:
```typescript
// src/application/use-cases/get-nf-by-id.use-case.ts
@Injectable()
export class GetNfByIdUseCase {
  constructor(
    private readonly nfRepository: INfRepository,
    private readonly cacheService: ICacheService,
    private readonly auditService: IAuditService,
  ) {}
  
  async execute(id: string, userId: string): Promise<NfDocumentDto> {
    // Cache check
    const cached = await this.cacheService.get(`nf:${id}`);
    if (cached) return cached;
    
    // Repository
    const nf = await this.nfRepository.findById(id);
    if (!nf) throw new NfNotFoundException(id);
    
    // Audit
    await this.auditService.logAccess(userId, 'NF', id);
    
    // Cache set
    await this.cacheService.set(`nf:${id}`, nf, 300);
    
    return NfDocumentDto.fromDomain(nf);
  }
}

// src/modules/api-gateway/controllers/nf.controller.ts
@Controller('api/v1/nf')
export class NfController {
  constructor(private readonly getNfByIdUseCase: GetNfByIdUseCase) {}
  
  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser() user: User) {
    return this.getNfByIdUseCase.execute(id, user.id);
  }
}
```

---

### 5. Health Check Falso Positivo

**Problema**: `/health/ready` retorna OK sem verificar conexões reais.

**Localização**: `src/modules/api-gateway/controllers/health.controller.ts`

**Evidência**:
```typescript
// ❌ Atual - Health check mentiroso
@Controller('health')
export class HealthController {
  @Get('ready')
  ready() {
    return { status: 'ok' }; // Não verifica NADA!
  }
  
  @Get('live')
  live() {
    return { status: 'ok' };
  }
}
```

**Impacto**:
- Kubernetes considera pod healthy quando DB está down
- Load balancer envia tráfego para pods quebrados
- Cascading failures não detectados

**Solução Proposta**:
```typescript
// src/infrastructure/health/health.service.ts
@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: Redis,
    private readonly rabbitMq: RabbitMqService,
  ) {}
  
  async checkReadiness(): Promise<HealthResult> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkRabbitMq(),
    ]);
    
    const results = {
      database: this.toHealthStatus(checks[0]),
      redis: this.toHealthStatus(checks[1]),
      rabbitmq: this.toHealthStatus(checks[2]),
    };
    
    const healthy = Object.values(results).every(r => r.status === 'up');
    return { healthy, checks: results };
  }
  
  private async checkDatabase(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }
  
  private async checkRedis(): Promise<void> {
    await this.redis.ping();
  }
  
  private async checkRabbitMq(): Promise<void> {
    if (!this.rabbitMq.isConnected()) {
      throw new Error('RabbitMQ not connected');
    }
  }
}

// src/modules/api-gateway/controllers/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  
  @Get('ready')
  async ready() {
    const result = await this.healthService.checkReadiness();
    if (!result.healthy) {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
  
  @Get('live')
  live() {
    return { status: 'ok' }; // Liveness só verifica se processo está vivo
  }
}
```

---

### 6. Stubs Vazios no Codebase

**Problema**: Módulos `email-consumer` e `s3-listener` existem mas são stubs vazios, criando confusão e risco.

**Localização**: 
- `src/modules/email-consumer/`
- `src/modules/s3-listener/`

**Evidência**:
```typescript
// src/modules/email-consumer/email-consumer.service.ts
@Injectable()
export class EmailConsumerService {
  // TODO: Implementar consumo de NF-e via IMAP
  async start(): Promise<void> {
    throw new Error('Not implemented');
  }
}
```

**Impacto**:
- Se feature flag habilitar, serviço crashea
- Confusão sobre escopo real do serviço
- Dependências (imap, mailparser) instaladas sem uso

**Solução Proposta**:

**Opção A - Remover stubs:**
```bash
rm -rf src/modules/email-consumer src/modules/s3-listener
pnpm remove imap mailparser @aws-sdk/client-sqs
# Atualizar app.module.ts
```

**Opção B - Feature flag seguro:**
```typescript
// src/modules/email-consumer/email-consumer.module.ts
@Module({})
export class EmailConsumerModule {
  static forRoot(): DynamicModule {
    const isEnabled = process.env.IMAP_ENABLED === 'true';
    
    if (!isEnabled) {
      return { module: EmailConsumerModule };
    }
    
    // Validar que todas as configs necessárias existem
    const requiredEnvVars = ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD'];
    const missing = requiredEnvVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`IMAP_ENABLED=true but missing: ${missing.join(', ')}`);
    }
    
    return {
      module: EmailConsumerModule,
      providers: [EmailConsumerService],
      exports: [EmailConsumerService],
    };
  }
}
```

---

## Pontos de Quebra (Failure Points)

### Diagrama de Failure Modes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FAILURE POINTS MAP                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [API Gateway]                                                              │
│       │                                                                     │
│       ├──❌ JWT Secret comprometido → bypass de auth                       │
│       ├──⚠️ Rate limit global (não por user) → DoS seletivo possível       │
│       └──⚠️ CORS aberto → CSRF attacks                                     │
│       │                                                                     │
│  [NfReceiver]                                                               │
│       │                                                                     │
│       ├──⚠️ Redis down → idempotência falha → duplicatas                   │
│       └──❌ RabbitMQ down → mensagens perdidas (sem retry HTTP)             │
│       │                                                                     │
│  [XmlProcessor]                                                             │
│       │                                                                     │
│       ├──⚠️ XML malformado sem XSD → dados inválidos persistidos           │
│       ├──⚠️ S3 down → upload falha → retry infinito ou perda               │
│       └──⚠️ OOM em XMLs grandes → processo morre                           │
│       │                                                                     │
│  [BusinessValidator]                                                        │
│       │                                                                     │
│       ├──❌ SEFAZ mock → NF inválidas aceitas (CRÍTICO)                     │
│       ├──⚠️ Receita WS down → circuit breaker abre → validação parcial     │
│       └──⚠️ Timeout curto → false negatives                                │
│       │                                                                     │
│  [Persistence]                                                              │
│       │                                                                     │
│       ├──❌ PostgreSQL down → perda de dados (sem dead letter persistence)  │
│       ├──⚠️ Decimal precision loss → valores financeiros errados           │
│       └──⚠️ Connection pool exhausted → timeout cascading                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Matriz de Acoplamento

| Módulo | Depende de | É dependência de | Nível de Acoplamento |
|--------|------------|------------------|----------------------|
| api-gateway | nf-receiver, persistence | - | 🟠 Alto |
| nf-receiver | redis, rabbitmq | api-gateway | 🟡 Médio |
| xml-processor | rabbitmq, s3 | - | 🟡 Médio |
| business-validator | rabbitmq, http-clients | - | 🟠 Alto |
| persistence | rabbitmq, database | api-gateway | 🟠 Alto |
| common | - | Todos | 🟢 Baixo (correto) |
| infrastructure | libs externas | Todos | 🟢 Baixo (correto) |

---

## Recomendações Arquiteturais

### Curto Prazo (1-2 sprints)

| # | Ação | Arquivos Afetados | Esforço |
|---|------|-------------------|---------|
| 1 | Implementar health checks reais | `health.controller.ts`, criar `health.service.ts` | S |
| 2 | Padronizar circuit breaker com factory | `clients/*.ts`, criar `circuit-breaker.factory.ts` | M |
| 3 | Criar BaseConsumer para eliminar duplicação | Todos os consumers | M |
| 4 | Decidir sobre stubs (remover ou implementar) | `email-consumer/`, `s3-listener/` | S |

### Médio Prazo (3-4 sprints)

| # | Ação | Arquivos Afetados | Esforço |
|---|------|-------------------|---------|
| 5 | Separar Domain Entities de ORM Entities | `entities/*.ts`, criar `domain/` | L |
| 6 | Criar camada de Use Cases | Criar `application/use-cases/` | L |
| 7 | Implementar integração SEFAZ real | `sefaz.client.ts`, configs | L |
| 8 | Adicionar validação XSD | `xml-processor.service.ts` | M |

### Longo Prazo (5+ sprints)

| # | Ação | Arquivos Afetados | Esforço |
|---|------|-------------------|---------|
| 9 | Extrair bounded contexts em microsserviços | Todo o projeto | XL |
| 10 | Implementar CQRS para queries complexas | Criar `read-models/` | L |
| 11 | Event sourcing para auditoria completa | Toda a camada de persistence | XL |

---

## Métricas de Arquitetura

| Métrica | Valor Atual | Alvo | Status |
|---------|-------------|------|--------|
| Depth of Inheritance | 1-2 | < 3 | ✅ |
| Afferent Coupling (Ca) | Alto em persistence | Médio | ⚠️ |
| Efferent Coupling (Ce) | Alto em api-gateway | Baixo | ❌ |
| Instability (Ce/(Ca+Ce)) | 0.7 | 0.3-0.5 | ❌ |
| Abstractness | 0.1 | 0.3-0.5 | ❌ |
| Distance from Main Sequence | Alto | < 0.3 | ❌ |

---

## Conclusão

A arquitetura atual é funcional para MVP mas apresenta débitos técnicos significativos que impedirão escala e manutenibilidade. Os pontos mais críticos são:

1. **SEFAZ mock** - Bloqueia go-to-production
2. **Health checks falsos** - Causa downtime silencioso
3. **Consumer duplicação** - Aumenta custo de manutenção
4. **Acoplamento domínio-infraestrutura** - Dificulta evolução

A refatoração deve ser incremental, começando pelos itens de curto prazo que têm maior ROI.
