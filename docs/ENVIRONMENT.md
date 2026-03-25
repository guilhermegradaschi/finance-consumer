# ENVIRONMENT.md — Variáveis de Ambiente Completas

## 1. Todas as Variáveis

| Variável                   | Obrigatória | Desenvolvimento               | Produção                                         | Descrição                                              |
|----------------------------|-------------|-------------------------------|--------------------------------------------------|--------------------------------------------------------|
| `NODE_ENV`                 | Sim         | `development`                 | `production`                                     | Ambiente de execução                                   |
| `PORT`                     | Não         | `3000`                        | `3000`                                           | Porta HTTP da aplicação                                |
| **PostgreSQL**             |             |                               |                                                  |                                                        |
| `DB_HOST`                  | Sim         | `localhost`                   | `postgres.nf-processor.svc.cluster.local`        | Host do PostgreSQL                                     |
| `DB_PORT`                  | Não         | `5432`                        | `5432`                                           | Porta do PostgreSQL                                    |
| `DB_USERNAME`              | Sim         | `nf_user`                     | `nf_prod_user`                                   | Usuário do banco                                       |
| `DB_PASSWORD`              | Sim         | `nf_password`                 | `<senha_segura_gerada>`                          | Senha do banco                                         |
| `DB_DATABASE`              | Sim         | `nf_processor`                | `nf_processor`                                   | Nome do banco                                          |
| `DB_SSL`                   | Não         | `false`                       | `true`                                           | Habilitar SSL na conexão                               |
| `DB_POOL_SIZE`             | Não         | `10`                          | `20`                                             | Tamanho do pool de conexões                            |
| `DB_IDLE_TIMEOUT_MS`       | Não         | `30000`                       | `30000`                                          | Timeout para conexões ociosas                          |
| `DB_CONNECTION_TIMEOUT_MS` | Não         | `5000`                        | `5000`                                           | Timeout para estabelecer conexão                       |
| **Redis**                  |             |                               |                                                  |                                                        |
| `REDIS_HOST`               | Sim         | `localhost`                   | `redis.nf-processor.svc.cluster.local`           | Host do Redis                                          |
| `REDIS_PORT`               | Não         | `6379`                        | `6379`                                           | Porta do Redis                                         |
| `REDIS_PASSWORD`           | Não         | _(vazio)_                     | `<senha_segura_gerada>`                          | Senha do Redis                                         |
| `REDIS_DB`                 | Não         | `0`                           | `0`                                              | Número do database Redis                               |
| `REDIS_KEY_PREFIX`         | Não         | `nf:`                         | `nf:`                                            | Prefixo para todas as chaves                           |
| `REDIS_DEFAULT_TTL`        | Não         | `86400`                       | `86400`                                          | TTL padrão em segundos (24h)                           |
| **RabbitMQ**               |             |                               |                                                  |                                                        |
| `RABBITMQ_URL`             | Sim         | `amqp://nf_user:nf_password@localhost:5672/nf_processor` | `amqp://nf_user:<pass>@rabbitmq:5672/nf_processor` | URL de conexão AMQP completa                       |
| `RABBITMQ_HEARTBEAT`       | Não         | `60`                          | `60`                                             | Heartbeat em segundos                                  |
| `RABBITMQ_PREFETCH_DEFAULT`| Não         | `10`                          | `10`                                             | Prefetch count padrão                                  |
| **AWS S3**                 |             |                               |                                                  |                                                        |
| `AWS_REGION`               | Não         | `us-east-1`                   | `us-east-1`                                      | Região AWS                                             |
| `AWS_ACCESS_KEY_ID`        | Sim*        | `minioadmin`                  | `<IAM_KEY>`                                      | Access Key. *Pode usar IAM role em produção            |
| `AWS_SECRET_ACCESS_KEY`    | Sim*        | `minioadmin`                  | `<IAM_SECRET>`                                   | Secret Key. *Pode usar IAM role em produção            |
| `S3_BUCKET`                | Sim         | `nf-processor-xmls`           | `nf-processor-xmls-prod`                         | Nome do bucket S3                                      |
| `S3_ENDPOINT`              | Não         | `http://localhost:9000`       | _(não definir)_                                  | Endpoint customizado (MinIO local)                     |
| `S3_FORCE_PATH_STYLE`      | Não         | `true`                        | `false`                                          | Path style para MinIO                                  |
| **SQS (S3 Events)**        |             |                               |                                                  |                                                        |
| `S3_EVENTS_SQS_URL`        | Não         | _(vazio)_                     | `https://sqs.us-east-1.amazonaws.com/123/nf-s3-events` | URL da fila SQS para eventos S3                  |
| **Autenticação**           |             |                               |                                                  |                                                        |
| `JWT_SECRET`               | Sim         | `dev-secret-change-me-32chars-minimum` | `<segredo_forte_64_chars>`               | Segredo para assinar/verificar JWT                     |
| `JWT_EXPIRATION`           | Não         | `24h`                         | `8h`                                             | Tempo de expiração do token                            |
| **APIs Externas**          |             |                               |                                                  |                                                        |
| `SEFAZ_API_URL`            | Sim**       | `http://localhost:3001/mock`  | `https://sefaz-api.sp.gov.br`                   | URL da API da SEFAZ. **Pode ser mock em dev            |
| `SEFAZ_API_TOKEN`          | Sim**       | `mock-token`                  | `<token_real>`                                   | Token de autenticação SEFAZ                            |
| `SEFAZ_TIMEOUT_MS`         | Não         | `10000`                       | `10000`                                          | Timeout para chamadas SEFAZ                            |
| `RECEITA_WS_URL`           | Não         | `https://receitaws.com.br/v1` | `https://receitaws.com.br/v1`                    | URL da API ReceitaWS                                   |
| `RECEITA_WS_TIMEOUT_MS`    | Não         | `10000`                       | `10000`                                          | Timeout para chamadas ReceitaWS                        |
| **Email (IMAP)**           |             |                               |                                                  |                                                        |
| `IMAP_HOST`                | Não***      | `imap.gmail.com`              | `imap.yourdomain.com`                            | Host IMAP. ***Só necessário se usar canal email        |
| `IMAP_PORT`                | Não         | `993`                         | `993`                                            | Porta IMAP                                             |
| `IMAP_USER`                | Não***      | `nfe@yourdomain.com`          | `nfe@yourdomain.com`                             | Usuário IMAP                                           |
| `IMAP_PASSWORD`            | Não***      | `<app_password>`              | `<app_password>`                                 | Senha IMAP                                             |
| **Observabilidade**        |             |                               |                                                  |                                                        |
| `SIGNOZ_ENDPOINT`          | Não         | `http://localhost:4318`       | `http://signoz-otel:4318`                        | Endpoint OTLP HTTP do SigNoz                           |
| `LOG_LEVEL`                | Não         | `debug`                       | `info`                                           | Nível mínimo de log                                    |
| **CORS**                   |             |                               |                                                  |                                                        |
| `CORS_ORIGIN`              | Não         | `*`                           | `https://dashboard.yourdomain.com`               | Origins permitidos para CORS                           |

---

## 2. Arquivo .env.development

```env
# .env.development

NODE_ENV=development
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=nf_user
DB_PASSWORD=nf_password
DB_DATABASE=nf_processor
DB_SSL=false
DB_POOL_SIZE=10

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=nf:

# RabbitMQ
RABBITMQ_URL=amqp://nf_user:nf_password@localhost:5672/nf_processor

# S3 (MinIO)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=nf-processor-xmls
S3_ENDPOINT=http://localhost:9000
S3_FORCE_PATH_STYLE=true

# Auth
JWT_SECRET=dev-secret-change-me-this-is-only-for-development-32chars
JWT_EXPIRATION=24h

# APIs Externas
SEFAZ_API_URL=http://localhost:3001/mock/sefaz
SEFAZ_API_TOKEN=mock-token-dev
SEFAZ_TIMEOUT_MS=10000
RECEITA_WS_URL=https://receitaws.com.br/v1
RECEITA_WS_TIMEOUT_MS=10000

# Observabilidade
SIGNOZ_ENDPOINT=http://localhost:4318
LOG_LEVEL=debug

# CORS
CORS_ORIGIN=*
```

---

## 3. Arquivo .env.production (template)

```env
# .env.production — TEMPLATE. Valores reais devem estar em Kubernetes Secrets.

NODE_ENV=production
PORT=3000

# PostgreSQL
DB_HOST=postgres.nf-processor.svc.cluster.local
DB_PORT=5432
DB_USERNAME=nf_prod_user
DB_PASSWORD=__FROM_K8S_SECRET__
DB_DATABASE=nf_processor
DB_SSL=true
DB_POOL_SIZE=20

# Redis
REDIS_HOST=redis.nf-processor.svc.cluster.local
REDIS_PORT=6379
REDIS_PASSWORD=__FROM_K8S_SECRET__
REDIS_DB=0
REDIS_KEY_PREFIX=nf:

# RabbitMQ
RABBITMQ_URL=amqp://nf_user:__FROM_K8S_SECRET__@rabbitmq:5672/nf_processor

# S3
AWS_REGION=us-east-1
S3_BUCKET=nf-processor-xmls-prod
# AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY via IAM Role (não definir aqui)

# Auth
JWT_SECRET=__FROM_K8S_SECRET__
JWT_EXPIRATION=8h

# APIs Externas
SEFAZ_API_URL=https://sefaz-api.sp.gov.br
SEFAZ_API_TOKEN=__FROM_K8S_SECRET__
SEFAZ_TIMEOUT_MS=10000
RECEITA_WS_URL=https://receitaws.com.br/v1
RECEITA_WS_TIMEOUT_MS=10000

# Observabilidade
SIGNOZ_ENDPOINT=http://signoz-otel-collector.observability.svc.cluster.local:4318
LOG_LEVEL=info

# CORS
CORS_ORIGIN=https://dashboard.yourdomain.com
```

---

## 4. Arquivo .env.example

```env
# .env.example — Copie para .env.development e preencha

NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=
DB_PASSWORD=
DB_DATABASE=nf_processor
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_URL=amqp://user:pass@localhost:5672/vhost
S3_BUCKET=nf-processor-xmls
JWT_SECRET=change-me-minimum-32-characters-long
SEFAZ_API_URL=
SEFAZ_API_TOKEN=
```

---

## 5. Validação de Environment no NestJS

```typescript
// src/config/app.config.ts — usado no ConfigModule.forRoot
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi'; // npm install joi

// No AppModule:
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
    PORT: Joi.number().default(3000),

    // PostgreSQL
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
    DB_USERNAME: Joi.string().required(),
    DB_PASSWORD: Joi.string().required(),
    DB_DATABASE: Joi.string().required(),
    DB_SSL: Joi.string().default('false'),
    DB_POOL_SIZE: Joi.number().default(10),

    // Redis
    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.number().default(6379),
    REDIS_PASSWORD: Joi.string().allow('').default(''),

    // RabbitMQ
    RABBITMQ_URL: Joi.string().required(),

    // S3
    S3_BUCKET: Joi.string().required(),
    AWS_REGION: Joi.string().default('us-east-1'),

    // Auth
    JWT_SECRET: Joi.string().min(32).required(),
  }),
  validationOptions: {
    allowUnknown: true, // Permite vars não listadas no schema
    abortEarly: false,  // Mostra TODOS os erros de validação
  },
}),
```

Isso garante que a aplicação **não inicia** se variáveis obrigatórias estiverem ausentes, evitando erros em runtime.
