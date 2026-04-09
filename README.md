# NF-e Processor (finance-consumer)

Sistema de processamento de Notas Fiscais Eletrônicas (NF-e) construído com NestJS.

## Stack Tecnológica

- **Framework**: NestJS 10.x + TypeScript 5.x (strict mode)
- **Database**: PostgreSQL 16 + TypeORM 0.3.x
- **Messaging**: RabbitMQ 3.13 (event-driven architecture)
- **Cache/Idempotency**: Redis 7.x (SETNX atômico)
- **Storage**: AWS S3 / MinIO (XMLs originais)
- **API**: REST + Swagger/OpenAPI 3.0

## Arquitetura

O sistema segue uma arquitetura event-driven com pipeline de processamento:

```
XML (API/Email/S3) → Receiver → XML Processor → Business Validator → Persistence
```

Cada estágio publica eventos no RabbitMQ, com retry automático (backoff exponencial) e Dead Letter Queues.

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose

## Setup Local

```bash
# Subir dependências
docker compose -f docker/docker-compose.yml up -d

# Instalar dependências
npm install

# Rodar migrations (requer PostgreSQL rodando)
npm run typeorm migration:run

# Iniciar em modo desenvolvimento
npm run start:dev
```

## Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /health/live | Liveness check |
| GET | /health/ready | Readiness check |
| POST | /api/v1/nf | Submeter NF-e para processamento |
| GET | /api/v1/nf | Listar NFs com filtros e paginação |
| GET | /api/v1/nf/:chaveAcesso | Detalhes de uma NF |
| GET | /api/v1/nf/:chaveAcesso/logs | Logs de processamento |
| GET | /api/v1/nf/summary | Resumo por status |
| POST | /api/v1/nf/reprocess/:chaveAcesso | Reprocessar NF |

Swagger UI disponível em: `http://localhost:3000/api/docs`

## Testes

```bash
npm run test          # Unit tests
npm run test:cov      # Coverage
npm run test:e2e      # E2E tests
```

## Docker Build (Produção)

```bash
docker build -f docker/Dockerfile -t nf-processor .
docker run -p 3000:3000 --env-file .env.production nf-processor
```

## Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml
```

## Estrutura do Projeto

```
src/
├── common/              # Shared: constants, enums, exceptions, filters, guards, interceptors, utils
├── config/              # Configuration files (app, database, redis, rabbitmq, s3, auth)
├── infrastructure/      # External service modules
│   ├── database/        # TypeORM/PostgreSQL
│   ├── rabbitmq/        # RabbitMQ messaging
│   ├── redis/           # Redis + Idempotency
│   ├── s3/              # AWS S3/MinIO
│   └── observability/   # Logger
├── migrations/          # TypeORM migrations
├── modules/             # Business modules
│   ├── api-gateway/     # REST API controllers + Swagger
│   ├── business-validator/  # CNPJ + SEFAZ validation
│   ├── email-consumer/  # IMAP email ingestion
│   ├── nf-receiver/     # Entry point for NF processing
│   ├── persistence/     # Entities, repositories, persistence service
│   ├── s3-listener/     # S3 event ingestion
│   └── xml-processor/   # XML parsing and S3 upload
├── schemas/nfe/         # XSD schemas para validação NF-e
└── test/                # Fixtures XML e configs Jest (e2e, integration)
```
