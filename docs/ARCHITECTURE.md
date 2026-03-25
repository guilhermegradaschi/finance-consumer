# ARCHITECTURE.md — Sistema de Processamento de Notas Fiscais

## 1. Visão Geral

O sistema processa Notas Fiscais Eletrônicas (NF-e) brasileiras recebidas por múltiplos canais (API REST, e-mail IMAP, bucket S3), executando validação de XML contra XSD, validação de regras de negócio via APIs externas (SEFAZ, CNPJ), persistência em PostgreSQL, armazenamento do XML original em S3 e notificação de resultado. Toda comunicação entre módulos é assíncrona via RabbitMQ.

### Diagrama de Alto Nível (textual)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  API Gateway │  │ Email Reader │  │ S3 Listener  │
│  (REST POST) │  │  (IMAP/SES)  │  │ (S3 Events)  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       ▼                 ▼                 ▼
  ┌─────────────────────────────────────────────┐
  │          RabbitMQ — exchange: nf.events      │
  │  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
  │  │nf.receive│ │nf.process│ │nf.validate   │  │
  │  │         │ │          │ │              │  │
  │  └─────────┘ └──────────┘ └──────────────┘  │
  │  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
  │  │nf.persist│ │nf.notify │ │nf.dlq.*      │  │
  │  └─────────┘ └──────────┘ └──────────────┘  │
  └─────────────────────────────────────────────┘
       │         │         │         │
       ▼         ▼         ▼         ▼
  ┌────────┐ ┌────────┐ ┌──────┐ ┌──────┐
  │Receiver│ │XML Proc│ │Biz   │ │Persis│
  │Module  │ │Module  │ │Valid. │ │tence │
  └────────┘ └────────┘ └──────┘ └──────┘
       │         │         │         │
       ▼         ▼         ▼         ▼
  ┌────────┐ ┌────────┐ ┌──────┐ ┌──────────┐
  │Redis   │ │S3      │ │SEFAZ │ │PostgreSQL│
  │(idemp.)│ │(XML)   │ │API   │ │          │
  └────────┘ └────────┘ └──────┘ └──────────┘
```

---

## 2. Princípios Arquiteturais

### 2.1 Event-Driven Architecture

Cada etapa do pipeline publica um evento ao concluir seu trabalho. Isso garante:

- **Desacoplamento**: Módulos não se conhecem diretamente. O Receiver não sabe quem irá processar o XML.
- **Escalabilidade independente**: Pode-se escalar apenas o módulo XML Processor se houver gargalo, sem alterar outros.
- **Auditabilidade**: Cada transição de estado gera um evento rastreável.

**Decisão**: Usamos RabbitMQ (e não Kafka) porque o volume esperado é de até 50.000 NFs/dia, a latência aceitável é de segundos, e precisamos de routing complexo (topic exchange) com dead-letter queues nativas. Kafka seria over-engineering para este cenário.

### 2.2 Idempotência

Toda operação é idempotente. Se a mesma NF for enviada 2 vezes (mesmo `chaveAcesso` de 44 dígitos), o sistema:

1. Gera um `idempotencyKey` = SHA-256 da `chaveAcesso`.
2. Verifica no Redis (TTL 24h) se a chave já existe.
3. Se existir, retorna o resultado anterior sem reprocessar.
4. Se não, processa e grava a chave no Redis.

**Decisão**: Redis como store de idempotência (não PostgreSQL) para latência sub-milissegundo em verificações de alta frequência.

### 2.3 Resiliência

- **Retry com backoff exponencial**: 3 tentativas com delays de 1s, 4s, 16s.
- **Dead Letter Queue (DLQ)**: Mensagens que falharam 3 vezes vão para `nf.dlq.<stage>`.
- **Circuit Breaker**: Para chamadas HTTP externas (SEFAZ, ReceitaWS). Abre após 5 falhas consecutivas, half-open após 30s.
- **Timeout**: Todas as chamadas HTTP têm timeout de 10s. Consumers RabbitMQ têm timeout de 60s.
- **Graceful Shutdown**: O sistema conclui mensagens em processamento antes de desligar.

---

## 3. Stack Tecnológica

| Componente          | Tecnologia             | Versão  | Justificativa                                                |
|---------------------|------------------------|---------|--------------------------------------------------------------|
| Runtime             | Node.js                | 20 LTS  | LTS com melhor performance para I/O assíncrono               |
| Framework           | NestJS                 | 10.x    | Framework enterprise para Node.js com DI, módulos, decorators|
| Linguagem           | TypeScript             | 5.x     | Strict mode para type safety                                 |
| Banco de Dados      | PostgreSQL             | 16      | ACID compliance, JSONB, extensões para XML                   |
| ORM                 | TypeORM                | 0.3.x   | Integração nativa NestJS, migrations, entities decorators    |
| Mensageria          | RabbitMQ               | 3.13    | Routing flexível, DLQ nativa, management UI                  |
| Cache/Idempotência  | Redis                  | 7.x     | Sub-ms latency para verificações de idempotência             |
| Object Storage      | AWS S3 (ou MinIO local)| -       | Armazenamento de XMLs originais                              |
| Observabilidade     | SigNoz + OpenTelemetry | -       | Tracing distribuído, métricas, logs centralizados            |
| Validação XML       | libxmljs2              | 0.33.x  | Validação XSD nativa em C, performance superior              |
| HTTP Client         | @nestjs/axios + axios  | -       | Circuit breaker via opossum                                  |
| Autenticação        | JWT via @nestjs/jwt    | -       | Stateless, escalável                                         |
| Documentação API    | @nestjs/swagger        | -       | OpenAPI 3.0 auto-gerado                                      |
| Testes              | Jest + Supertest       | -       | Padrão NestJS, mocking nativo                                |
| Containers          | Docker + Docker Compose| -       | Ambiente reproduzível                                        |
| Orquestração        | Kubernetes             | -       | Produção escalável                                           |

---

## 4. Bounded Contexts

O sistema é dividido em 7 bounded contexts, cada um mapeado para um módulo NestJS:

### 4.1 Ingestion Context
- **Módulos**: `NfReceiverModule`, `EmailConsumerModule`, `S3ListenerModule`
- **Responsabilidade**: Receber NF-e de qualquer canal e normalizar para o formato interno.
- **Evento de saída**: `nf.received`

### 4.2 Processing Context
- **Módulo**: `XmlProcessorModule`
- **Responsabilidade**: Validar XML contra XSD, extrair metadados, armazenar XML no S3.
- **Evento de saída**: `nf.processed`

### 4.3 Validation Context
- **Módulo**: `BusinessValidatorModule`
- **Responsabilidade**: Validar regras de negócio (CNPJ ativo, chave de acesso válida na SEFAZ).
- **Evento de saída**: `nf.validated`

### 4.4 Persistence Context
- **Módulo**: `PersistenceModule`
- **Responsabilidade**: Persistir NF-e e itens no PostgreSQL de forma transacional.
- **Evento de saída**: `nf.persisted`

### 4.5 Query Context
- **Módulo**: `ApiGatewayModule`
- **Responsabilidade**: Expor endpoints REST para consulta, listagem e submissão manual de NFs.

### 4.6 Notification Context
- **Módulo**: (futuro) `NotificationModule`
- **Responsabilidade**: Notificar sistemas downstream via webhook/email sobre resultado do processamento.

### 4.7 Infrastructure Context
- **Módulos**: `DatabaseModule`, `RedisModule`, `RabbitMQModule`, `S3Module`, `ObservabilityModule`
- **Responsabilidade**: Prover serviços de infraestrutura transversais.

---

## 5. Padrões de Design

| Padrão                  | Onde é usado                          | Porquê                                              |
|-------------------------|---------------------------------------|------------------------------------------------------|
| **Pipeline/Chain**      | Fluxo receive→process→validate→persist| Cada estágio é independente e encadeado via eventos   |
| **Repository**          | Acesso a dados PostgreSQL             | Abstração de persistência, facilita testes            |
| **Strategy**            | Validações de negócio (CNPJ, SEFAZ)  | Permite adicionar novas validações sem alterar código |
| **Circuit Breaker**     | Chamadas HTTP externas                | Evita cascata de falhas                               |
| **Idempotent Consumer** | Todos os consumers RabbitMQ           | Garante processamento exatamente uma vez              |
| **Dead Letter**         | Filas RabbitMQ                        | Captura mensagens com falha para análise              |
| **DTO/Transform**       | Entrada/saída de cada módulo          | Validação e transformação de dados na fronteira       |
| **Guard**               | API Gateway                           | Autenticação/autorização centralizada                 |
| **Interceptor**         | Logging, métricas                     | Cross-cutting concerns sem poluir lógica de negócio   |
| **Exception Filter**    | Global                                | Tratamento padronizado de erros                       |

---

## 6. Estrutura de Pastas do Projeto

```
nf-processor/
├── src/
│   ├── main.ts                           # Bootstrap da aplicação
│   ├── app.module.ts                     # Módulo raiz
│   │
│   ├── common/                           # Código compartilhado
│   │   ├── constants/
│   │   │   ├── index.ts
│   │   │   ├── queues.constants.ts       # Nomes de exchanges, queues, routing keys
│   │   │   └── error-codes.constants.ts  # Códigos de erro padronizados
│   │   ├── decorators/
│   │   │   └── idempotent.decorator.ts   # Decorator para idempotência
│   │   ├── dtos/
│   │   │   ├── base-response.dto.ts      # Response wrapper padrão
│   │   │   └── pagination.dto.ts         # DTO de paginação
│   │   ├── enums/
│   │   │   ├── nf-status.enum.ts         # RECEIVED, PROCESSING, VALIDATED, PERSISTED, ERROR
│   │   │   └── nf-source.enum.ts         # API, EMAIL, S3
│   │   ├── exceptions/
│   │   │   ├── business-validation.exception.ts
│   │   │   ├── xml-validation.exception.ts
│   │   │   └── idempotency.exception.ts
│   │   ├── filters/
│   │   │   └── global-exception.filter.ts
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts
│   │   │   └── metrics.interceptor.ts
│   │   ├── interfaces/
│   │   │   ├── nf-event.interface.ts     # Contrato de eventos RabbitMQ
│   │   │   └── processing-result.interface.ts
│   │   └── utils/
│   │       ├── hash.util.ts              # SHA-256 helper
│   │       └── xml.util.ts              # XML parsing helpers
│   │
│   ├── infrastructure/                   # Módulos de infraestrutura
│   │   ├── database/
│   │   │   ├── database.module.ts
│   │   │   └── typeorm.config.ts
│   │   ├── redis/
│   │   │   ├── redis.module.ts
│   │   │   └── redis.service.ts
│   │   ├── rabbitmq/
│   │   │   ├── rabbitmq.module.ts
│   │   │   └── rabbitmq.service.ts
│   │   ├── s3/
│   │   │   ├── s3.module.ts
│   │   │   └── s3.service.ts
│   │   └── observability/
│   │       ├── observability.module.ts
│   │       ├── logger.service.ts
│   │       ├── metrics.service.ts
│   │       └── tracing.config.ts
│   │
│   ├── modules/
│   │   ├── nf-receiver/
│   │   │   ├── nf-receiver.module.ts
│   │   │   ├── nf-receiver.service.ts
│   │   │   ├── nf-receiver.consumer.ts
│   │   │   ├── dto/
│   │   │   │   ├── receive-nf.dto.ts
│   │   │   │   └── nf-received-event.dto.ts
│   │   │   └── __tests__/
│   │   │       ├── nf-receiver.service.spec.ts
│   │   │       └── nf-receiver.consumer.spec.ts
│   │   │
│   │   ├── xml-processor/
│   │   │   ├── xml-processor.module.ts
│   │   │   ├── xml-processor.service.ts
│   │   │   ├── xml-processor.consumer.ts
│   │   │   ├── xsd/
│   │   │   │   └── nfe_v4.00.xsd         # Schema XSD oficial
│   │   │   ├── dto/
│   │   │   │   ├── xml-metadata.dto.ts
│   │   │   │   └── nf-processed-event.dto.ts
│   │   │   └── __tests__/
│   │   │       ├── xml-processor.service.spec.ts
│   │   │       └── xml-processor.consumer.spec.ts
│   │   │
│   │   ├── business-validator/
│   │   │   ├── business-validator.module.ts
│   │   │   ├── business-validator.service.ts
│   │   │   ├── business-validator.consumer.ts
│   │   │   ├── clients/
│   │   │   │   ├── sefaz.client.ts
│   │   │   │   └── receita-ws.client.ts
│   │   │   ├── dto/
│   │   │   │   ├── validation-result.dto.ts
│   │   │   │   └── nf-validated-event.dto.ts
│   │   │   └── __tests__/
│   │   │       ├── business-validator.service.spec.ts
│   │   │       └── sefaz.client.spec.ts
│   │   │
│   │   ├── persistence/
│   │   │   ├── persistence.module.ts
│   │   │   ├── persistence.service.ts
│   │   │   ├── persistence.consumer.ts
│   │   │   ├── entities/
│   │   │   │   ├── nota-fiscal.entity.ts
│   │   │   │   ├── nf-item.entity.ts
│   │   │   │   ├── nf-emitente.entity.ts
│   │   │   │   ├── nf-destinatario.entity.ts
│   │   │   │   ├── nf-transporte.entity.ts
│   │   │   │   ├── nf-pagamento.entity.ts
│   │   │   │   └── nf-processing-log.entity.ts
│   │   │   ├── repositories/
│   │   │   │   ├── nota-fiscal.repository.ts
│   │   │   │   └── nf-processing-log.repository.ts
│   │   │   └── __tests__/
│   │   │       ├── persistence.service.spec.ts
│   │   │       └── persistence.consumer.spec.ts
│   │   │
│   │   ├── api-gateway/
│   │   │   ├── api-gateway.module.ts
│   │   │   ├── controllers/
│   │   │   │   ├── nf.controller.ts
│   │   │   │   ├── health.controller.ts
│   │   │   │   └── reprocess.controller.ts
│   │   │   ├── dto/
│   │   │   │   ├── submit-nf.dto.ts
│   │   │   │   ├── query-nf.dto.ts
│   │   │   │   ├── nf-response.dto.ts
│   │   │   │   └── nf-list-response.dto.ts
│   │   │   └── __tests__/
│   │   │       └── nf.controller.spec.ts
│   │   │
│   │   ├── email-consumer/
│   │   │   ├── email-consumer.module.ts
│   │   │   ├── email-consumer.service.ts
│   │   │   ├── email-consumer.scheduler.ts
│   │   │   └── __tests__/
│   │   │       └── email-consumer.service.spec.ts
│   │   │
│   │   └── s3-listener/
│   │       ├── s3-listener.module.ts
│   │       ├── s3-listener.service.ts
│   │       ├── s3-listener.consumer.ts
│   │       └── __tests__/
│   │           └── s3-listener.service.spec.ts
│   │
│   └── config/
│       ├── app.config.ts                 # ConfigModule schema + validation
│       ├── database.config.ts
│       ├── rabbitmq.config.ts
│       ├── redis.config.ts
│       ├── s3.config.ts
│       └── auth.config.ts
│
├── migrations/
│   ├── 1700000000000-CreateNotaFiscalTable.ts
│   ├── 1700000000001-CreateNfItemTable.ts
│   ├── 1700000000002-CreateNfEmitenteTable.ts
│   ├── 1700000000003-CreateNfDestinatarioTable.ts
│   ├── 1700000000004-CreateNfTransporteTable.ts
│   ├── 1700000000005-CreateNfPagamentoTable.ts
│   └── 1700000000006-CreateNfProcessingLogTable.ts
│
├── test/
│   ├── jest-e2e.json
│   ├── app.e2e-spec.ts
│   └── fixtures/
│       ├── valid-nfe.xml
│       ├── invalid-nfe.xml
│       └── nfe-sample-response.json
│
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   └── docker-compose.yml
│
├── k8s/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── hpa.yaml
│   └── ingress.yaml
│
├── .env.example
├── .env.development
├── .env.production
├── .eslintrc.js
├── .prettierrc
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
├── package.json
└── README.md
```

---

## 7. Decisões Técnicas Justificadas

### 7.1 TypeORM vs Prisma

**Escolha: TypeORM**
- Decorators de entity integram naturalmente com decorators NestJS.
- Suporte a migrations programáticas.
- Repositories customizáveis via `@EntityRepository`.
- Prisma tem melhor DX mas gera client que não se integra tão bem com o pattern de DI do NestJS.

### 7.2 RabbitMQ vs Bull/BullMQ

**Escolha: RabbitMQ**
- Bull usa Redis como backend — misturar responsabilidades de cache e fila.
- RabbitMQ oferece routing (topic exchange), DLQ nativa, e management UI.
- Bull é adequado para job queues simples; nosso pipeline precisa de event routing.

### 7.3 Monorepo vs Polyrepo

**Escolha: Monorepo (single NestJS app com múltiplos módulos)**
- Complexidade de deploy reduzida para MVP.
- Compartilhamento de código entre módulos sem pacotes NPM internos.
- Pode ser dividido em microserviços no futuro se necessário (cada módulo já é independente).

### 7.4 REST vs GraphQL para API

**Escolha: REST**
- Clientes são sistemas internos e ERPs, que trabalham melhor com REST.
- Swagger/OpenAPI gera documentação automática.
- Não há necessidade de queries flexíveis que justifiquem GraphQL.

### 7.5 Validação XML: libxmljs2 vs fast-xml-parser

**Escolha: libxmljs2**
- Única lib Node.js com validação XSD real (binding C de libxml2).
- fast-xml-parser só faz parsing, não valida contra schema.
- Performance: valida XML de NF-e (avg 15KB) em < 5ms.

### 7.6 Estratégia de Armazenamento de XML

- XML original → S3 (imutável, versionado, barato).
- Metadados extraídos → PostgreSQL (queryable).
- Não armazenamos XML no banco para evitar bloat e manter o banco performático.
