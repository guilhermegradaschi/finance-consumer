# IMPLEMENTATION_GUIDE.md — Guia Passo a Passo de Implementação

## 1. Ordem de Desenvolvimento

```
Fase 1: Fundação (Dia 1-2)
├── Setup do projeto NestJS
├── Configuração de ambiente (.env)
├── Módulos de infraestrutura (Database, Redis, RabbitMQ, S3)
└── Docker Compose para desenvolvimento

Fase 2: Core Pipeline (Dia 3-5)
├── Entities e Migrations
├── NF Receiver Module
├── XML Processor Module
├── Business Validator Module
└── Persistence Module

Fase 3: API & Canais (Dia 6-7)
├── API Gateway Module (Controllers, Auth, Swagger)
├── Email Consumer Module
└── S3 Listener Module

Fase 4: Qualidade (Dia 8-9)
├── Testes unitários
├── Testes de integração
├── Global Exception Filter
├── Logging & Metrics

Fase 5: Deploy (Dia 10)
├── Dockerfile produção
├── Kubernetes manifests
├── CI/CD pipeline
└── Documentação
```

---

## 2. Setup Inicial

### 2.1 Criar projeto NestJS

```bash
# Instalar NestJS CLI
npm i -g @nestjs/cli

# Criar projeto
nest new nf-processor --strict --package-manager npm

cd nf-processor

# Instalar dependências core
npm install @nestjs/config @nestjs/typeorm @nestjs/swagger @nestjs/axios @nestjs/schedule @nestjs/throttler
npm install typeorm pg
npm install ioredis
npm install amqplib
npm install @aws-sdk/client-s3 @aws-sdk/client-sqs
npm install class-validator class-transformer
npm install jsonwebtoken
npm install libxmljs2
npm install mailparser imap
npm install opossum
npm install uuid
npm install swagger-ui-express

# Dependências de tipos
npm install -D @types/amqplib @types/imap @types/jsonwebtoken @types/uuid @types/opossum

# OpenTelemetry
npm install @opentelemetry/sdk-node @opentelemetry/api
npm install @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
npm install @opentelemetry/sdk-metrics
npm install @opentelemetry/auto-instrumentations-node
npm install @opentelemetry/resources @opentelemetry/semantic-conventions

# Dev dependencies
npm install -D @testcontainers/postgresql testcontainers
```

### 2.2 Configurar TypeScript strict

```json
// tsconfig.json — atualizar para:
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "src/*": ["src/*"]
    }
  }
}
```

### 2.3 Criar estrutura de pastas

```bash
# Criar estrutura
mkdir -p src/common/{constants,decorators,dtos,enums,exceptions,filters,guards,interceptors,interfaces,utils}
mkdir -p src/infrastructure/{database,redis,rabbitmq,s3,observability}
mkdir -p src/modules/{nf-receiver/dto,nf-receiver/__tests__}
mkdir -p src/modules/{xml-processor/dto,xml-processor/__tests__,xml-processor/xsd}
mkdir -p src/modules/{business-validator/dto,business-validator/__tests__,business-validator/clients}
mkdir -p src/modules/{persistence/entities,persistence/repositories,persistence/__tests__}
mkdir -p src/modules/{api-gateway/controllers,api-gateway/dto,api-gateway/__tests__}
mkdir -p src/modules/{email-consumer/__tests__}
mkdir -p src/modules/{s3-listener/__tests__}
mkdir -p src/config
mkdir -p migrations
mkdir -p test/fixtures
mkdir -p docker
mkdir -p k8s
```

### 2.4 Criar .env.development

```bash
cp .env.example .env.development
# Ver ENVIRONMENT.md para valores
```

---

## 3. Checklist por Milestone

### ✅ Milestone 1: Infraestrutura funcional

- [ ] `docker-compose up` sobe PostgreSQL, Redis, RabbitMQ e MinIO
- [ ] Aplicação NestJS conecta em todos os serviços
- [ ] Logs mostram "connected" para cada serviço
- [ ] `GET /health` retorna `{"status": "healthy"}`

**Como testar:**
```bash
cd docker && docker-compose up -d
npm run start:dev
curl http://localhost:3000/health
# Esperado: {"status":"healthy","checks":{"redis":"ok"}}
```

### ✅ Milestone 2: Database pronto

- [ ] Entities TypeORM criadas para todas as 7 tabelas
- [ ] Migration `InitialSchema` criada e roda sem erros
- [ ] `typeorm migration:run` executa com sucesso
- [ ] Verificar tabelas no PostgreSQL via `psql` ou pgAdmin

**Como testar:**
```bash
npx typeorm migration:run -d src/infrastructure/database/typeorm.config.ts
# Verificar:
docker exec -it docker-postgres-1 psql -U nf_user -d nf_processor -c "\dt"
```

### ✅ Milestone 3: RabbitMQ topology

- [ ] Exchanges criados: nf.events, nf.retry, nf.dlq
- [ ] Todas as queues criadas com bindings corretos
- [ ] DLQ configurada para cada queue de processamento
- [ ] Management UI acessível em http://localhost:15672

**Como testar:**
```bash
npm run start:dev
# Verificar no RabbitMQ Management UI:
# http://localhost:15672 (nf_user/nf_password)
# → Exchanges: 3 exchanges
# → Queues: 11 queues
# → Bindings corretos
```

### ✅ Milestone 4: Pipeline básico (receive → process → validate → persist)

- [ ] POST /api/v1/nf aceita XML e retorna 202
- [ ] Mensagem aparece na fila nf.xml-processor.queue
- [ ] XML Processor consome, valida e publica nf.processed
- [ ] Business Validator consome e publica nf.validated
- [ ] Persistence consome e insere no PostgreSQL
- [ ] NF aparece no banco com status COMPLETED

**Como testar:**
```bash
# Enviar NF-e
curl -X POST http://localhost:3000/api/v1/nf \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(node -e "console.log(require('jsonwebtoken').sign({sub:'test'}, 'your-secret'))")" \
  -d '{"xmlContent": "<?xml ...XML válido..."}'

# Verificar status
curl http://localhost:3000/api/v1/nf/35240112345678000195550010000001231234567890 \
  -H "Authorization: Bearer ..."

# Verificar no banco
docker exec -it docker-postgres-1 psql -U nf_user -d nf_processor \
  -c "SELECT id, chave_acesso, status FROM nota_fiscal"
```

### ✅ Milestone 5: Idempotência

- [ ] Enviar mesma NF 2x retorna 200 na segunda vez
- [ ] Apenas 1 registro no PostgreSQL
- [ ] Redis contém a chave de idempotência

**Como testar:**
```bash
# Enviar 2x o mesmo XML
curl -X POST ... # 1ª vez → 202
curl -X POST ... # 2ª vez → 200 com alreadyProcessed: true

# Verificar Redis
docker exec -it docker-redis-1 redis-cli KEYS "nf:idempotency:*"
```

### ✅ Milestone 6: Retry e DLQ

- [ ] Simular falha no S3 → mensagem vai para retry queue
- [ ] Após 3 retries, mensagem vai para DLQ
- [ ] Processing log registra cada tentativa

**Como testar:**
```bash
# Parar o MinIO para simular falha S3
docker stop docker-minio-1

# Enviar NF → deve falhar no XML Processor (S3 unavailable)
curl -X POST ...

# Verificar retry queue no RabbitMQ Management UI
# Após 3 tentativas, verificar DLQ

# Reiniciar MinIO
docker start docker-minio-1
```

### ✅ Milestone 7: API completa

- [ ] GET /api/v1/nf com filtros funciona
- [ ] GET /api/v1/nf/:chaveAcesso retorna detalhes
- [ ] GET /api/v1/nf/:chaveAcesso/logs retorna histórico
- [ ] Swagger em /api/docs funcional
- [ ] JWT guard bloqueia requests sem token

### ✅ Milestone 8: Testes passando

- [ ] `npm run test` → testes unitários passam
- [ ] `npm run test:cov` → coverage > 80%
- [ ] `npm run test:e2e` → testes E2E passam

### ✅ Milestone 9: Deploy ready

- [ ] `docker build` produz imagem funcional
- [ ] Kubernetes manifests aplicados sem erros
- [ ] Health checks passam no K8s
- [ ] HPA configurado

---

## 4. Troubleshooting Comum

| Problema | Causa | Solução |
|----------|-------|---------|
| `ECONNREFUSED` ao conectar no PostgreSQL | Container não iniciou | `docker-compose up -d postgres` e esperar health check |
| `Channel closed` no RabbitMQ | Prefetch excedido ou conexão perdida | Verificar heartbeat e implementar reconexão |
| `libxmljs2` não compila | Falta dependências nativas | `apk add libxml2-dev libxslt-dev python3 make g++` |
| Migration falha com "relation already exists" | Migration já foi executada | Verificar tabela `typeorm_migrations` |
| XML validation falha | Namespace incorreto | Verificar namespace `http://www.portalfiscal.inf.br/nfe` |
| Redis `WRONGPASS` | Senha incorreta no .env | Verificar `REDIS_PASSWORD` |
| S3 `AccessDenied` no MinIO | Bucket não existe | Rodar `minio-init` ou criar manualmente |
| JWT `invalid signature` | Secret diferente entre geração e validação | Unificar `JWT_SECRET` |
| TypeORM `EntityMetadataNotFoundError` | Entity não registrada no module | Adicionar entity no `TypeOrmModule.forFeature()` |
| RabbitMQ queue não criada | `setupTopology()` não executou | Verificar `onModuleInit` do RabbitMQModule |

---

## 5. Próximos Passos Após Cada Etapa

### Após MVP funcional:
1. **Notification Module** — Webhook/email para sistemas downstream.
2. **Dashboard administrativo** — UI React para monitoramento.
3. **Bulk import** — Endpoint para upload de múltiplas NFs.
4. **Relatórios** — Geração de relatórios agregados.
5. **Multi-tenancy** — Isolamento por empresa/tenant.
6. **Cache de consultas** — Redis cache para queries frequentes.
7. **Compactação de XML** — gzip antes de enviar para S3.
8. **Audit trail** — Log imutável de todas as ações.
