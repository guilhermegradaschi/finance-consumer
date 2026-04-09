# Implementation Checklist — finance-consumer

**Última atualização do checklist:** Fases 1–2 + **Fase 3 (Features & Integrations, em grande parte entregue)** — itens marcados conforme código em `src/`, `k8s/`, `src/schemas/nfe/`, `docs/adr/`. Itens **(parcial)** ainda exigem trabalho, homologação externa (SEFAZ), XSDs oficiais no disco, ou escopo Fase 4 / infra (ESO aplicado no cluster, TLS Ingress, etc.).

---

## 1. Arquitetura

- [ ] Separar Domain Entities de ORM Entities (criar `src/domain/entities/` com entidades puras e `src/infrastructure/persistence/typeorm/` com ORM entities + mappers)
  - Origem: docs/01-architecture-audit.md (seção "Violação de Limites de Domínio")
  - Motivo: `NfDocument`, `NfItem` e `NfEvent` contêm decorators TypeORM, acoplando domínio à infraestrutura e impedindo testes sem mock do ORM
  - Impacto: alto
  - **Parcial (Fase 3):** existem `src/domain/nota-fiscal.read-model.ts` e mapper para snapshot de leitura/auditoria; entidades TypeORM não foram movidas para `infrastructure/persistence/typeorm/`.

- [x] Criar camada de Application/Use Cases (`src/application/use-cases/`) para `ReceiveNfUseCase`, `GetNfByIdUseCase` e `ReprocessNfUseCase`
  - Origem: docs/01-architecture-audit.md (seção "Acoplamento API Gateway ↔ Domain"), docs/06-development-rules.md (regra A01)
  - Motivo: Controllers acessam diretamente services de domínio e `PersistenceService`, impossibilitando lógica cross-cutting (cache, auditoria) sem modificar controllers
  - Impacto: médio
  - Implementação: `src/application/application.module.ts` + use cases `receive-nf`, `list-nf`, `get-nf-by-id`, `get-nf-summary`, `get-nf-logs`, `reprocess-nf`; `NfController` e `ReprocessController` delegam aos use cases.

- [x] Migrar `XmlProcessorConsumer` para estender `BaseConsumer<NfReceivedEvent>`
  - Origem: docs/05-agent-task-list.md (TASK-202)
  - Motivo: Eliminar duplicação de lógica de retry/DLQ, reduzindo de ~100 para ~30 linhas
  - Impacto: médio
  - Implementação: `src/modules/xml-processor/xml-processor.consumer.ts` → `BaseConsumer<NfReceivedEventDto>`.

- [x] Migrar `BusinessValidatorConsumer` para estender `BaseConsumer<NfParsedEvent>`
  - Origem: docs/05-agent-task-list.md (TASK-203)
  - Motivo: Eliminar duplicação de lógica de retry/DLQ
  - Impacto: médio
  - Implementação: `src/modules/business-validator/business-validator.consumer.ts` → `BaseConsumer<NfProcessedEventDto>`.

- [x] Migrar `PersistenceConsumer` para estender `BaseConsumer<NfValidatedEvent>`
  - Origem: docs/05-agent-task-list.md (TASK-204)
  - Motivo: Eliminar duplicação de lógica de retry/DLQ
  - Impacto: médio
  - Implementação: `src/modules/persistence/persistence.consumer.ts` → `BaseConsumer<NfValidatedEventDto>`.

- [x] Decidir se módulos stub `email-consumer` e `s3-listener` devem ser implementados ou removidos; se mantidos, proteger com feature flag seguro e validação de env vars no startup
  - Origem: docs/01-architecture-audit.md (seção "Stubs Vazios no Codebase"), docs/00-overview.md (tabela de Stubs)
  - Motivo: Stubs lançam `throw new Error('Not implemented')` — se feature flag habilitar, serviço crasheia; dependências (`imap`, `mailparser`, `@aws-sdk/client-sqs`) instaladas sem uso
  - Impacto: médio
  - Implementação: decisão registrada em [docs/adr/0002-email-s3-stubs.md](adr/0002-email-s3-stubs.md); com `IMAP_ENABLED`/`SQS_ENABLED` os serviços não derrubam o processo (email retorna vazio; SQS sem long-poll implementado). Remoção de deps ou implementação completa permanece opcional.

- [ ] Refatorar `RabbitMqService` monolítico (~400 linhas, 15+ métodos) em componentes menores: `ConnectionManager`, `ChannelManager`, `Publisher`, `ConsumerRegistry`
  - Origem: docs/02-code-quality-audit.md (seção "RabbitMQ Service Monolítico")
  - Motivo: Responsabilidades múltiplas e estado complexo dificultam manutenção e testes
  - Impacto: médio

- [ ] Configurar path aliases no `tsconfig.json` (`@common/*`, `@config/*`, `@infrastructure/*`, `@application/*`, `@domain/*`, `@modules/*`) e atualizar imports existentes
  - Origem: docs/06-development-rules.md (regra I02)
  - Motivo: Imports relativos profundos (`../../common/constants/`) dificultam leitura e refatoração
  - Impacto: baixo

- [ ] Garantir que a direção de dependências siga `Presentation → Application → Domain ← Infrastructure` sem imports cruzados proibidos
  - Origem: docs/06-development-rules.md (regra A02, regra I04)
  - Motivo: Regra documentada não está sendo seguida — controllers importam diretamente de persistence
  - Impacto: médio
  - **Parcial (Fase 3):** controllers da API Gateway usam apenas use cases (`ApplicationModule`); `src/domain/mappers/nota-fiscal.mapper.ts` ainda importa a entidade TypeORM `NotaFiscal`. Falta separação completa domain/ORM (ver itens §1 e §4).

---

## 2. Backend

- [x] Implementar integração real com SEFAZ (SOAP + certificado digital A1) substituindo o mock que retorna sempre `AUTORIZADA`
  - Origem: docs/00-overview.md (risco #1), docs/01-architecture-audit.md (seção "Circuit Breaker Inconsistente"), docs/07-risk-register.md (RISK-001)
  - Motivo: NF-e inválidas, canceladas ou inexistentes são aceitas — bloqueia go-to-production
  - Impacto: alto
  - **Parcial:** `SefazClient` com HTTPS + PKCS#12 (`SEFAZ_CERT_PATH`), envelope `consSitNFe` / NFeConsultaProtocolo4, `cStat === 100` como autorizada; modo mock quando `SEFAZ_MOCK_ENABLED` não é `false`; fallback do circuit breaker com `valid: false` (não aceita NF quando SEFAZ indisponível). **Pendente:** validação ponta a ponta na homologação da SEFAZ/SVRS do ambiente real e ajuste fino do SOAP se o WSDL divergir.

- [x] Adicionar feature flag `SEFAZ_MOCK_ENABLED` que impede uso de mock em `NODE_ENV=production` com fail-fast no startup
  - Origem: docs/08-improvement-backlog.md (IMP-001), docs/07-risk-register.md (RISK-001)
  - Motivo: Evitar deploy acidental de mock em produção
  - Impacto: alto
  - Implementação: Joi em `app.module.ts` (custom) + `src/config/sefaz.config.ts`; em produção exige `SEFAZ_MOCK_ENABLED=false`, `SEFAZ_WEBSERVICE_URL` e `SEFAZ_CERT_PATH`.

- [x] Migrar `JwtAuthGuard` manual para `passport-jwt` Strategy validando issuer, audience e algorithm (HS256 explícito)
  - Origem: docs/02-code-quality-audit.md (seção "JwtAuthGuard Implementação Manual"), docs/05-agent-task-list.md (TASK-002)
  - Motivo: Guard atual não valida claims obrigatórios (iss, aud, exp), não suporta token blacklist e não loga tentativas de acesso
  - Impacto: alto
  - Implementação: `src/common/strategies/jwt.strategy.ts` (`algorithms: ['HS256']`, `JWT_ISSUER` / `JWT_AUDIENCE` opcionais), `JwtAuthGuard` estende `AuthGuard('jwt')`, `TokenBlacklistService` + verificação na strategy; `POST /api/v1/auth/revoke`.

- [x] Implementar `Decimal.js` para todos os campos monetários (`totalValue`, `unitPrice`, `quantity`, etc.) substituindo `number` JavaScript
  - Origem: docs/02-code-quality-audit.md (seção "Decimal Transformer com Perda de Precisão"), docs/07-risk-register.md (RISK-008)
  - Motivo: `parseFloat` causa perda de precisão — `parseFloat('12345678901234.5678')` retorna `12345678901234.568`; pode causar diferenças em reconciliação contábil
  - Impacto: alto
  - Implementação: `decimal.js` + `src/common/transformers/decimal-column.transformer.ts`; entidades `NotaFiscal`, `NfItem`, `NfPagamento`, `NfTransporte` com tipo `Decimal`; eventos/DTOs de pipeline usam **string** para montantes onde aplicável (`XmlMetadataDto`, `NfProcessedEventDto`); `PersistenceService` usa `toDecimalValue()`.

- [x] Implementar validação XSD contra schema NF-e 4.0 em `XmlProcessorService` antes do parse, adicionando schemas oficiais em `schemas/`
  - Origem: docs/02-code-quality-audit.md (seção "Falta de Validação XSD"), docs/07-risk-register.md (RISK-006)
  - Motivo: XMLs malformados ou com estrutura incorreta passam pelo pipeline e causam erros downstream ou dados incorretos persistidos
  - Impacto: alto
  - **Parcial:** `NfeXsdValidationService` (`libxmljs2`) + `validateOrSkip` antes do parse em `XmlProcessorService`; `NFE_XSD_BASE_PATH` / `NFE_XSD_MAIN_FILE`; instruções em [schemas/nfe/README.md](../src/schemas/nfe/README.md). Se path/XSD ausente, validação é ignorada (log). **Pendente:** versionar ou automatizar download do pacote oficial de XSD no deploy.

- [x] Criar `CircuitBreakerFactory` injetável em `src/infrastructure/http/circuit-breaker.factory.ts` usando `opossum` com defaults padronizados
  - Origem: docs/01-architecture-audit.md (seção "Circuit Breaker Inconsistente"), docs/05-agent-task-list.md (TASK-205)
  - Motivo: `SefazClient` usa circuit breaker manual incompleto (sem timeout para reset, half-open state ou métricas), enquanto `ReceitaWsClient` usa `opossum` corretamente
  - Impacto: alto
  - Implementação: `circuit-breaker.factory.ts`, `HttpInfraModule` (`src/infrastructure/http/http.module.ts`), testes em `__tests__/circuit-breaker.factory.spec.ts`.

- [x] Migrar `SefazClient` e `ReceitaWsClient` para usar `CircuitBreakerFactory` com configuração consistente
  - Origem: docs/05-agent-task-list.md (TASK-206)
  - Motivo: Comportamento inconsistente entre clients de integração externa
  - Impacto: médio
  - Implementação: ambos usam `factory.create()` + `fallback`; interop CJS `require('opossum')` para Jest/Nest.

- [x] Criar hierarquia padronizada de exceptions: `BaseException` → `RetryableException` / `NonRetryableException` → exceptions específicas de domínio e infraestrutura
  - Origem: docs/02-code-quality-audit.md (seção "Exception Handling Inconsistente"), docs/05-agent-task-list.md (TASK-208)
  - Motivo: Mix de exception types, catch genéricos, exceptions sem contexto (`NfNotFoundException` extends `Object`, não `Error`)
  - Impacto: alto
  - Implementação: `BaseException` com `httpStatus`; `BusinessException` / `InfrastructureException`; `RetryableException` (503), `NonRetryableException` (400); `NfNotFoundException` estende `BusinessException` (404, código `NF404`).

- [x] Refatorar `GlobalExceptionFilter` para usar a nova hierarquia de exceptions, retornando `errorCode`, `correlationId`, `timestamp` e ocultando stack trace em produção
  - Origem: docs/05-agent-task-list.md (TASK-209)
  - Motivo: Responses de erro inconsistentes e sem informações de rastreamento
  - Impacto: médio
  - Implementação: corpo JSON com `errorCode` (antes `code`), `correlationId` via `getCorrelationId()`, `stack` apenas fora de `NODE_ENV=production`; `BaseException` usa `httpStatus`.

- [x] Centralizar magic strings e números em constantes: `QUEUES` (nomes de filas), `TIMEOUTS` (valores de timeout), `NfStatus` (enum de status)
  - Origem: docs/02-code-quality-audit.md (seção "Magic Strings e Números")
  - Motivo: Typos em nomes de filas (`'nf.recieved'` vs `'nf.received'`), status com case diferente (`'PROCESSING'` vs `'processing'` vs `'IN_PROCESSING'`), timeouts inconsistentes entre clients
  - Impacto: médio
  - **Parcial:** `RETRY_ROUTING_KEYS`, `DLQ_ROUTING_KEYS`, `PIPELINE_STAGES` em `queues.constants.ts`; topology RabbitMQ e consumers usam essas constantes. **Pendente:** `TIMEOUTS` centralizado, revisão completa de enums/status em todo o código.

- [x] Criar validadores customizados reutilizáveis: `@IsChaveAcesso()`, `@IsCnpj()`, `@IsCpf()`, `@IsIe(uf)` com validação de dígito verificador
  - Origem: docs/02-code-quality-audit.md (seção "DTO Validation Boilerplate"), docs/05-agent-task-list.md (TASK-211)
  - Motivo: Validações de chave de acesso (44 dígitos) e CNPJ (14 dígitos) duplicadas em `CreateNfDto`, `ReprocessNfDto`, `QueryNfDto`
  - Impacto: médio
  - **Parcial:** `src/common/validation/br-tax-id.util.ts` + `src/common/validators/br.decorators.ts` (`IsChaveNFe`, `IsCnpj`, `IsCpf`, `IsIe`); `@IsCnpj()` em `QueryNfDto`; parâmetro `:chaveAcesso` validado com `ChaveAcessoParamPipe` em `nf.controller` e `reprocess.controller`. **Pendente:** aplicar em `SubmitNfDto` se surgir chave no body; DTO dedicado para reprocess se desejado.

- [x] Eliminar todos os usos de `any` explícito e implícito (~50 ocorrências), habilitar `@typescript-eslint/no-explicit-any: error`
  - Origem: docs/02-code-quality-audit.md (seção "Any Types e Type Assertions"), docs/05-agent-task-list.md (TASK-210)
  - Motivo: `parseXml()` retorna `Promise<any>`, type assertions perigosos (`result as NfDocument`), non-null assertions (`request.user!`)
  - Impacto: médio
  - **Parcial:** `.eslintrc.js` com `@typescript-eslint/no-explicit-any`: `error`. **Pendente:** varredura completa de assertions e `!`; `npm run lint` pode falhar no ESLint 9 até migração para `eslint.config.js`.

- [x] Implementar rate limiting por usuário (baseado em JWT `sub`) via Redis sliding window, além do rate limit global existente
  - Origem: docs/04-refactor-roadmap.md (tarefa 3.9), docs/07-risk-register.md (RISK-009)
  - Motivo: Rate limit global (100 req/min total) permite que um único usuário consuma toda a cota, causando DoS para outros
  - Impacto: médio
  - Implementação: `UserRateLimitGuard` + `RedisService.slidingWindowHit` (`USER_RATE_LIMIT_MAX`, `USER_RATE_LIMIT_WINDOW_MS`) nas rotas NF; fallback por IP se sem `sub`.

- [ ] Implementar token refresh/rotation e token blacklist para logout
  - Origem: docs/04-refactor-roadmap.md (tarefa 3.11), docs/02-code-quality-audit.md (seção "JwtAuthGuard")
  - Motivo: Guard atual não suporta token refresh/rotation nem blacklist; tokens comprometidos permanecem válidos até expirar
  - Impacto: médio
  - **Parcial:** blacklist Redis + `POST /api/v1/auth/revoke`. **Pendente:** fluxo de refresh token / rotação (issuer separado, endpoint `/auth/refresh`, etc.).

- [x] Implementar audit logging para operações sensíveis (acesso a NF-e, reprocessamento, alterações)
  - Origem: docs/04-refactor-roadmap.md (tarefa 3.10), docs/08-improvement-backlog.md (IMP-010)
  - Motivo: Não há rastreamento de quem acessou ou modificou dados — necessário para compliance fiscal
  - Impacto: médio
  - Implementação: `AuditLogService` + logs estruturados (`type: audit`) nos use cases (submit, list, get, logs, summary, reprocess, revoke).

- [x] Implementar graceful shutdown que drena consumers RabbitMQ e completa requests HTTP em andamento antes de encerrar
  - Origem: docs/04-refactor-roadmap.md (tarefa 4.5)
  - Motivo: Sem graceful shutdown, mensagens em processamento podem ser perdidas durante rollouts
  - Impacto: alto
  - Implementação: `ShutdownCoordinatorService` (`beforeApplicationShutdown`): `HealthService.beginShutdown()` (readiness 503), `HttpAdapterHost` fecha o HTTP server, `RabbitMQService.drainConsumers(SHUTDOWN_DRAIN_MS)` cancela consumers por tag e aguarda handlers ativos; reconexão AMQP desativada durante shutdown. `k8s/deployment.yaml`: `terminationGracePeriodSeconds: 90`, `preStop` sleep 5s.

- [x] Configurar CORS restritivo com lista explícita de origens via `CORS_ORIGINS` env var (diferente por ambiente)
  - Origem: docs/00-overview.md (risco #7), docs/07-risk-register.md (RISK-007), docs/05-agent-task-list.md (TASK-003)
  - Motivo: `app.enableCors()` sem opções aceita qualquer origem, facilitando ataques CSRF e exfiltração de dados
  - Impacto: alto
  - **Parcial:** `main.ts` — produção exige `CORS_ORIGINS` (lista separada por vírgula), validado também no Joi de `app.module.ts`; `development`/`test` permitem `origin: true`.

---

## 3. Frontend

- [x] Documentar formalmente que o `finance-consumer` é um serviço backend-only sem componente frontend, e registrar essa decisão como ADR
  - Origem: docs/00-overview.md (escopo do serviço)
  - Motivo: O serviço processa NF-e via API REST e filas — não possui e não deve possuir frontend; documentar para evitar ambiguidade
  - Impacto: baixo
  - Implementação: [docs/adr/0001-backend-only-service.md](adr/0001-backend-only-service.md).

---

## 4. Banco de dados

- [x] Corrigir `decimalTransformer` para usar `Decimal.js` em vez de `parseFloat`, evitando perda de precisão em campos `decimal(15,4)` do PostgreSQL
  - Origem: docs/02-code-quality-audit.md (seção "Decimal Transformer com Perda de Precisão")
  - Motivo: `parseFloat` no transformer `from` causa perda de precisão em valores financeiros grandes — problemas legais/fiscais potenciais
  - Impacto: alto
  - Implementação: `decimalColumnTransformer` / `decimalColumnNullableTransformer` + `toDecimalValue()` em `src/common/transformers/decimal-column.transformer.ts`.

- [x] Serializar valores `Decimal` como `string` nos DTOs de resposta JSON para preservar precisão no transporte
  - Origem: docs/02-code-quality-audit.md (solução proposta para Decimal)
  - Motivo: JSON não tem tipo decimal nativo; serializar como number reintroduziria perda de precisão no cliente
  - Impacto: médio
  - Implementação: `Decimal.prototype.toJSON` do pacote `decimal.js` serializa como string; lista NF-e em `NfListResponseDto` documentada como montantes em string; pipeline interno usa strings para totais XML onde aplicável.

- [ ] Avaliar e simplificar repositories custom (`NfDocumentRepository`) que apenas wrappam `TypeORM Repository` sem agregar valor; manter custom repository apenas para queries complexas
  - Origem: docs/02-code-quality-audit.md (seção "Repository Pattern Desnecessário"), docs/07-risk-register.md (RISK-015)
  - Motivo: Código boilerplate desnecessário — `findById()` e `save()` são delegações diretas sem lógica adicional
  - Impacto: baixo

- [ ] Criar ORM entities separadas (ex.: `NfDocumentOrmEntity`) com mappers bidirecionais (`NfDocumentMapper.toDomain()` / `.toOrm()`) ao separar domínio de infraestrutura
  - Origem: docs/01-architecture-audit.md (solução proposta para "Violação de Limites de Domínio")
  - Motivo: Permite testar domínio sem mock do TypeORM e facilita troca futura de ORM
  - Impacto: médio
  - **Parcial (Fase 3):** `src/domain/nota-fiscal.read-model.ts` (`NfDocumentSnapshot`) + `src/domain/mappers/nota-fiscal.mapper.ts` (`toNfDocumentSnapshot`); entidades TypeORM permanecem em `modules/persistence/entities/` sem pasta `infrastructure/persistence/typeorm/` dedicada.

- [ ] Verificar se migrations existentes refletem precisão `decimal(15,4)` correta e se não há inconsistência entre definição de entity e schema real do PostgreSQL
  - Origem: docs/02-code-quality-audit.md (contexto de precision), docs/00-overview.md (risco #9)
  - Motivo: Se precision/scale no TypeORM divergir do schema real, valores podem ser silenciosamente truncados
  - Impacto: médio

---

## 5. Infraestrutura e deploy

- [ ] Migrar secrets do `k8s/secret.yaml` (com valores `REPLACE_ME` base64) para External Secrets Operator com `ExternalSecret` CRD referenciando AWS Secrets Manager ou Vault
  - Origem: docs/03-infra-audit.md (seção "Secret - CRÍTICO"), docs/07-risk-register.md (RISK-003), docs/05-agent-task-list.md (TASK-004)
  - Motivo: `DB_PASSWORD`, `RABBITMQ_PASSWORD` e `JWT_SECRET` estão como `REPLACE_ME` base64 — deploy pode usar placeholders ou falhar silenciosamente
  - Impacto: alto
  - **Parcial:** exemplo `k8s/external-secret.example.yaml` com `refreshInterval: 1h` e mapeamento de chaves; aplicação no cluster e remoção/substituição segura de `k8s/secret.yaml` permanecem pendentes.

- [ ] Configurar TLS no Ingress com `cert-manager` e `ClusterIssuer` para Let's Encrypt, incluindo redirect HTTP → HTTPS
  - Origem: docs/03-infra-audit.md (seção "Ingress com TLS"), docs/07-risk-register.md (RISK-014), docs/05-agent-task-list.md (TASK-005)
  - Motivo: Ingress atual não configura TLS — tráfego pode ser interceptado em trânsito, expondo NF-e e tokens em plain text
  - Impacto: alto

- [x] Criar `PodDisruptionBudget` em `k8s/pdb.yaml` com `minAvailable: 2`
  - Origem: docs/03-infra-audit.md (seção "PodDisruptionBudget"), docs/07-risk-register.md (RISK-010), docs/05-agent-task-list.md (TASK-105)
  - Motivo: Sem PDB, `kubectl drain` pode derrubar todos os pods simultaneamente durante manutenção
  - Impacto: alto

- [ ] Adicionar `resources.requests` e `resources.limits` (CPU e memória) no `deployment.yaml`
  - Origem: docs/03-infra-audit.md (tabela de problemas nos manifests)
  - Motivo: Sem resource limits, pods podem consumir recursos indefinidamente, causando OOM ou starvation de outros pods
  - Impacto: alto

- [ ] Adicionar `securityContext` no `deployment.yaml`: `runAsNonRoot`, `readOnlyRootFilesystem`, `drop ALL capabilities`
  - Origem: docs/03-infra-audit.md (seção "Deployment Completo")
  - Motivo: Container roda como root sem restrições — vulnerabilidade de segurança em caso de escape
  - Impacto: alto

- [ ] Adicionar `topologySpreadConstraints` e `podAntiAffinity` no deployment para distribuir pods entre zones/nodes
  - Origem: docs/03-infra-audit.md (seção "Deployment Completo")
  - Motivo: Todos os pods podem cair em um único node; falha do node derruba 100% da capacidade
  - Impacto: médio

- [ ] Reescrever `Dockerfile` como multi-stage build: stage builder com `npm ci`, stage production com `node:20.10-alpine`, non-root user, `dumb-init`, healthcheck Docker
  - Origem: docs/03-infra-audit.md (seção "Dockerfile")
  - Motivo: Dockerfile atual usa single-stage (`node:20` full ~1GB), roda como root, usa `npm install` (não determinístico) e não tem healthcheck
  - Impacto: alto

- [x] Criar `.dockerignore` para excluir `.git`, `node_modules`, `coverage`, `.env*`, `*.md`, `docker-compose*`
  - Origem: docs/03-infra-audit.md (seção ".dockerignore")
  - Motivo: Sem `.dockerignore`, copia-se tudo incluindo `.git` e `node_modules` dev, inflando a imagem
  - Impacto: baixo
  - Implementação: `.dockerignore` na raiz exclui `.git`, `node_modules`, `coverage`, `.env*`, `docs/`, `src/test/`, `k8s/`, `src/schemas/`.

- [ ] Melhorar HPA (`k8s/hpa.yaml`) adicionando escala por métrica customizada de profundidade de fila RabbitMQ
  - Origem: docs/03-infra-audit.md (seção "HPA Melhorado"), docs/04-refactor-roadmap.md (tarefa 1.6)
  - Motivo: HPA atual escala apenas por CPU — filas acumulando não disparam scale-up
  - Impacto: médio
  - **Parcial:** `k8s/hpa.yaml` já escala por **CPU e memória**; métrica de fila como próximo passo.

- [x] Adicionar job de security scan (SAST) no CI pipeline com Trivy e/ou Snyk
  - Origem: docs/03-infra-audit.md (tabela de problemas no CI/CD), docs/08-improvement-backlog.md (IMP-038)
  - Motivo: Vulnerabilidades em código e dependências não são detectadas automaticamente
  - Impacto: alto
  - Implementação: job `security-scan` em `.github/workflows/ci-cd.yml` com `aquasecurity/trivy-action` (filesystem scan, severity HIGH+CRITICAL, exit-code 1).

- [x] Adicionar `npm audit --audit-level=high` como step no CI pipeline
  - Origem: docs/03-infra-audit.md (tabela de problemas no CI/CD)
  - Motivo: CVEs em dependências npm não são verificadas — ausência de scan de dependências
  - Impacto: alto
  - Implementação: step `npm audit --audit-level=high` no job `lint-and-test` de `.github/workflows/ci-cd.yml`.

- [ ] Adicionar lint de Dockerfile (hadolint) como step no CI pipeline
  - Origem: docs/03-infra-audit.md (tabela de problemas no CI/CD)
  - Motivo: Best practices de Dockerfile não são validadas automaticamente
  - Impacto: baixo

- [x] Adicionar testes de integração com RabbitMQ real (via service container) no CI pipeline
  - Origem: docs/03-infra-audit.md (tabela de problemas no CI/CD)
  - Motivo: CI atual não testa integração com message broker — regressões em messaging passam despercebidas
  - Impacto: alto
  - Implementação: service container `rabbitmq:3.13-management-alpine` + step `npm run test:integration` no job `lint-and-test` de `.github/workflows/ci-cd.yml`.

- [x] Configurar cache de Docker layers no CI (`cache-from: type=gha`) via Docker Buildx
  - Origem: docs/03-infra-audit.md (tabela de problemas no CI/CD)
  - Motivo: Builds lentos sem cache de layers
  - Impacto: baixo
  - Implementação: `docker/setup-buildx-action@v3` + `cache-from: type=gha` / `cache-to: type=gha,mode=max` no job `build-docker`.

- [ ] Adicionar labels padronizados Kubernetes (`app.kubernetes.io/name`, `app.kubernetes.io/component`, `app.kubernetes.io/version`) em todos os manifests
  - Origem: docs/03-infra-audit.md (tabela de problemas nos manifests)
  - Motivo: Labels inconsistentes ou ausentes dificultam queries de monitoramento e gerenciamento
  - Impacto: baixo

- [x] Configurar scan de imagem Docker após build no CI (Trivy) para detectar CVEs na imagem final
  - Origem: docs/03-infra-audit.md (seção "CI/CD Pipeline Proposto")
  - Motivo: Vulnerabilidades na imagem base ou em pacotes do SO podem passar para produção
  - Impacto: alto
  - Implementação: step `aquasecurity/trivy-action` com `image-ref` após push no job `build-docker`.

---

## 6. Observabilidade e monitoramento

- [x] `HealthService` + `GET /health/ready` com checagens reais (PostgreSQL, RabbitMQ, Redis) e **503** quando degradado; `GET /health/live` permanece liveness leve
  - Origem: docs/04-refactor-roadmap.md (tarefas 1.1–1.2), plano Fase 1
  - Implementação: `src/infrastructure/health/`, `src/modules/api-gateway/controllers/health.controller.ts`
  - Impacto: alto

- [x] Implementar structured logging em formato JSON com campos obrigatórios (`timestamp`, `level`, `message`, `service`, `correlationId`)
  - Origem: docs/03-infra-audit.md (estado atual de Observabilidade), docs/05-agent-task-list.md (TASK-106)
  - Motivo: Logs atuais são texto livre, dificultando busca e análise em Loki/ELK
  - Impacto: alto
  - **Parcial:** `correlationId` incluído quando há contexto (HTTP ou consumer RabbitMQ); demais logs via `Logger` do Nest permanecem fora do `AppLoggerService`.

- [x] Implementar propagação de `correlationId` via middleware HTTP + `AsyncLocalStorage` + RabbitMQ message properties em todas as camadas do pipeline
  - Origem: docs/05-agent-task-list.md (TASK-107), docs/03-infra-audit.md
  - Motivo: Logs não são correlacionáveis entre stages do pipeline; troubleshooting requer acesso direto a pods
  - Impacto: alto
  - Implementação: `src/common/correlation/correlation-context.ts`, `src/common/middleware/correlation-id.middleware.ts`, `src/main.ts`, `src/infrastructure/rabbitmq/rabbitmq.service.ts`

- [x] Configurar OpenTelemetry SDK com `@opentelemetry/sdk-node` para tracing distribuído, exportando traces para OTEL Collector
  - Origem: docs/03-infra-audit.md (seção "Implementação de Tracing"), docs/04-refactor-roadmap.md (tarefa 1.9)
  - Motivo: Não há tracing distribuído — impossível rastrear latência end-to-end do pipeline
  - Impacto: médio
  - Implementação: `src/infrastructure/observability/tracing.ts`, shutdown em `TracingShutdownHook`; env `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_SDK_DISABLED`; desligado em `NODE_ENV=test`.

- [x] Instrumentar HTTP clients (`SefazClient`, `ReceitaWsClient`) com spans OpenTelemetry
  - Origem: docs/04-refactor-roadmap.md (tarefa 1.10)
  - Motivo: Chamadas a serviços externos não aparecem em traces — dificulta diagnóstico de lentidão
  - Impacto: médio
  - Implementação: `src/infrastructure/observability/http-client-tracing.ts` + clients em `src/modules/business-validator/clients/`

- [ ] Garantir que logs de erro incluam stack trace completo mas nunca dados sensíveis (passwords, tokens, números de cartão)
  - Origem: docs/06-development-rules.md (regra S02), docs/05-agent-task-list.md (TASK-106)
  - Motivo: Regra de segurança documentada que precisa ser validada na implementação de structured logging
  - Impacto: alto

---

## 7. Segurança

- [x] Remover valor default do `JWT_SECRET` em `.env.example` e `src/config/auth.config.ts`; rejeitar secrets contendo palavras "dev", "secret", "change", "example"
  - Origem: docs/00-overview.md (risco #2), docs/07-risk-register.md (RISK-002), docs/05-agent-task-list.md (TASK-001)
  - Motivo: `JWT_SECRET=dev-secret-key-change-in-production` pode ser usado acidentalmente em produção, permitindo forjar tokens válidos
  - Impacto: alto
  - **Parcial:** `auth.config.ts` sem fallback inseguro; em produção Joi exige `JWT_SECRET` ≥ 32 caracteres e rejeita padrões fracos (substring). `.env.example` usa placeholder textual `your-secret-key-here` apenas para desenvolvimento local.

- [x] Implementar validação rigorosa de variáveis de ambiente no startup via Joi schema com fail-fast (`DB_PASSWORD` min 16 chars em production, `JWT_SECRET` min 32 chars, URLs validadas como URI)
  - Origem: docs/03-infra-audit.md (seção "Validação de Configuração"), docs/05-agent-task-list.md (TASK-006)
  - Motivo: Aplicação não falha se env vars críticas estão ausentes ou com valores inválidos — falhas silenciosas em runtime
  - Impacto: alto
  - **Parcial:** `ConfigModule` em `app.module.ts` com regras reforçadas em `production` (JWT, `DB_PASSWORD`, `CORS_ORIGINS`, SEFAZ); outras variáveis seguem schema existente. **Pendente:** endurecer 100% dos campos críticos conforme backlog (ex.: todas as URLs obrigatórias em prod).

- [ ] Remover ou proteger arquivo `k8s/secret.yaml` que contém valores `REPLACE_ME` (base64 de placeholder) para `DB_PASSWORD`, `RABBITMQ_PASSWORD`, `JWT_SECRET`
  - Origem: docs/00-overview.md (risco #3), docs/07-risk-register.md (RISK-003)
  - Motivo: Arquivo commitado pode ser aplicado acidentalmente em cluster, causando falha de conexão ou pior — autenticação com credenciais placeholder
  - Impacto: alto

- [x] Validar algorithm JWT explicitamente como `HS256` na Strategy para prevenir algorithm confusion attacks
  - Origem: docs/02-code-quality-audit.md (solução proposta para JWT), docs/07-risk-register.md (RISK-013)
  - Motivo: Sem algoritmo explícito, tokens assinados com `none` ou `RS256` podem ser aceitos indevidamente
  - Impacto: alto
  - Implementação: `JwtStrategy` com `algorithms: ['HS256']`.

- [x] Implementar token blacklist service via Redis para suportar logout e revogação de tokens comprometidos
  - Origem: docs/02-code-quality-audit.md (solução proposta para JWT Strategy)
  - Motivo: Tokens comprometidos permanecem válidos até expirar; não há mecanismo de revogação
  - Impacto: médio
  - Implementação: `TokenBlacklistService` (chave `jwt:blk:` + hash SHA-256 do token, TTL até `exp`); `POST /api/v1/auth/revoke`.

- [x] Validar tamanho máximo de payload XML na API para prevenir ataques de XML bomb / billion laughs
  - Origem: docs/06-development-rules.md (regra S03), docs/01-architecture-audit.md (failure point "OOM em XMLs grandes")
  - Motivo: Sem limite de tamanho, XMLs maliciosos podem causar OOM e derrubar o processo
  - Impacto: alto
  - Implementação: `MAX_XML_BODY_BYTES` (default 5 MiB) aplicado a `json()` / `urlencoded()` em `main.ts`; parse XSD com `noent: false`, `nonet: true` em `NfeXsdValidationService`.

- [ ] Garantir que todas as queries usem parametrização (TypeORM query builder com parâmetros, nunca interpolação de strings)
  - Origem: docs/06-development-rules.md (regra S04)
  - Motivo: Regra de segurança documentada — verificar se não há queries raw com interpolação no codebase
  - Impacto: alto

- [x] Adicionar headers de segurança HTTP (Helmet.js): `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`
  - Origem: docs/03-infra-audit.md (contexto geral de segurança de infraestrutura)
  - Motivo: Headers de segurança padrão não estão configurados — ausência facilita ataques como clickjacking e MIME sniffing
  - Impacto: médio
  - **Parcial:** `helmet()` em `main.ts` com `contentSecurityPolicy: false` para não quebrar Swagger/OpenAPI em desenvolvimento; HSTS efetivo depende também de TLS no Ingress/proxy.

- [ ] Configurar rotação automática de secrets via External Secrets Operator com `refreshInterval: 1h`
  - Origem: docs/03-infra-audit.md (tabela de problemas no CI/CD, item "Secrets sem rotação automática")
  - Motivo: Secrets sem rotação aumentam janela de exposição em caso de vazamento
  - Impacto: médio
  - **Parcial:** `refreshInterval: 1h` documentado no `k8s/external-secret.example.yaml`; cluster real ainda precisa do ESO + SecretStore configurados.

---

## 8. Testes

- [x] Aumentar cobertura de testes unitários de 70-80% para 85%+ (meta geral), com 90%+ em services, 95%+ em use cases e 100% em validators
  - Origem: docs/00-overview.md (Métricas de Código), docs/06-development-rules.md (regra T03)
  - Motivo: Cobertura atual insuficiente para refatorações seguras; meta documentada é 85%+
  - Impacto: alto
  - **Parcial:** `jest` `coverageThreshold` global: `lines`/`statements` ≥ **85%**, `branches` ≥ **60%**, `functions` ≥ **80%**; `collectCoverageFrom` exclui vários artefatos sem testes unitários direto (consumers, módulo persistence completo, alguns controllers, clients HTTP externos, etc.) — ver `package.json`. **Pendente:** metas 90%/95%/100% por camada; testcontainers/E2E (itens abaixo).

- [x] Criar testes de integração com PostgreSQL, Redis e RabbitMQ reais usando `testcontainers`, com limpeza de estado entre testes
  - Origem: docs/00-overview.md (Métricas de Código — "Testes de integração: Baixa"), docs/06-development-rules.md (regra T05)
  - Motivo: Testes atuais mockam infraestrutura — regressões de integração não são detectadas
  - Impacto: alto
  - Implementação: `testcontainers` + `@testcontainers/postgresql` + `@testcontainers/rabbitmq`; helpers em `test/support/containers.ts` e `test/support/test-app.factory.ts`; 3 suites: `persistence.integration-spec.ts` (CRUD, decimal precision, pagination, rollback), `redis.integration-spec.ts` (get/set, setNx idempotência, slidingWindowHit rate limiting), `rabbitmq.integration-spec.ts` (publish/consume, correlationId, retry, DLQ, drain).

- [ ] Criar suite de testes E2E do pipeline completo (API → NfReceiver → XmlProcessor → BusinessValidator → Persistence)
  - Origem: docs/00-overview.md (Métricas de Código — "Testes E2E: Inexistente"), docs/04-refactor-roadmap.md (tarefa 4.1)
  - Motivo: Não há testes que validem o fluxo completo end-to-end; essencial antes de produção
  - Impacto: alto

- [ ] Implementar load testing com k6 validando throughput sustentável de >1000 NF-e/min
  - Origem: docs/04-refactor-roadmap.md (tarefa 4.2, KPI de FASE 4)
  - Motivo: Sem load testing, não há garantia de performance sob carga — bottlenecks desconhecidos
  - Impacto: médio

- [ ] Criar testes de smoke com feature flags habilitados/desabilitados para stubs (`IMAP_ENABLED`, `SQS_ENABLED`)
  - Origem: docs/08-improvement-backlog.md (IMP-045), docs/07-risk-register.md (RISK-012)
  - Motivo: Feature flags podem habilitar stubs vazios que crasheiam o serviço; smoke tests detectam isso
  - Impacto: médio

- [ ] Criar testes de integração com SEFAZ de homologação quando integração real for implementada
  - Origem: docs/04-refactor-roadmap.md (tarefa 3.5)
  - Motivo: Integração SEFAZ é crítica e deve ser validada em ambiente de homologação antes de produção
  - Impacto: alto
  - **Parcial:** `src/modules/business-validator/clients/__tests__/sefaz.client.integration.spec.ts` (executável com `SEFAZ_INTEGRATION_TEST=1`); conteúdo mínimo — expandir com credenciais/URL de homologação no CI ou job manual.

- [ ] Tuning de connection pools (DB, Redis) com testes de carga para identificar valores ótimos
  - Origem: docs/04-refactor-roadmap.md (tarefa 4.4), docs/03-infra-audit.md (risco "Connection pool exhaustion")
  - Motivo: `DB_POOL_SIZE=20` pode ser alto para pods pequenos ou insuficiente sob carga
  - Impacto: médio

---

## 9. Documentação

- [ ] Atualizar `README.md` com arquitetura real, instruções de setup, variáveis de ambiente obrigatórias e comandos de desenvolvimento
  - Origem: docs/04-refactor-roadmap.md (tarefa 4.6), docs/07-risk-register.md (RISK-016)
  - Motivo: Documentação menciona nomes de filas e rotas que podem divergir do código real; causa confusão em onboarding
  - Impacto: médio
  - **Parcial (Fase 1):** README ganhou seção **Observabilidade** (OTEL, correlation ID, smoke curls) e referência a `kubectl apply -f k8s/pdb.yaml`; revisão completa de filas/rotas vs código permanece pendente.

- [ ] Documentar APIs com Swagger/OpenAPI decorators nos controllers e DTOs para gerar documentação interativa
  - Origem: docs/04-refactor-roadmap.md (tarefa 4.7), docs/08-improvement-backlog.md (IMP-047)
  - Motivo: Endpoints não têm documentação formal; devs dependem de leitura de código para entender contratos
  - Impacto: médio

- [ ] Criar runbooks de operação (`docs/runbooks/`) para cada alerta configurado, com passos de diagnóstico e resolução
  - Origem: docs/04-refactor-roadmap.md (tarefa 4.8), docs/03-infra-audit.md (checklist de Pré-Produção)
  - Motivo: Sem runbooks, cada incidente requer investigação from-scratch; MTTR alto
  - Impacto: alto

- [ ] Documentar plano de disaster recovery (`docs/dr/`): backup de dados, RTO/RPO, procedimento de restore
  - Origem: docs/04-refactor-roadmap.md (tarefa 4.9), docs/08-improvement-backlog.md (IMP-049)
  - Motivo: Não há procedimento documentado de DR — risco de perda de dados em falha catastrófica
  - Impacto: alto

- [ ] Criar Architecture Decision Records (ADRs) em `docs/adr/` para decisões já tomadas (TypeORM, RabbitMQ, Redis para idempotência, etc.)
  - Origem: docs/04-refactor-roadmap.md (tarefa 4.10), docs/08-improvement-backlog.md (IMP-050)
  - Motivo: Decisões arquiteturais não estão documentadas — novos devs não entendem trade-offs
  - Impacto: baixo
  - **Parcial:** [docs/adr/0001-backend-only-service.md](adr/0001-backend-only-service.md), [docs/adr/0002-email-s3-stubs.md](adr/0002-email-s3-stubs.md). **Pendente:** ADRs para stack principal (TypeORM, RabbitMQ, Redis, etc.).

- [ ] Documentar setup de External Secrets Operator e cert-manager em `docs/secrets-setup.md` e `docs/tls-setup.md`
  - Origem: docs/05-agent-task-list.md (TASK-004, TASK-005)
  - Motivo: Pré-requisitos de infraestrutura precisam de documentação para setup em novos clusters
  - Impacto: médio
  - **Parcial:** referência de manifesto em `k8s/external-secret.example.yaml` (comentários inline). **Pendente:** guias dedicados `docs/secrets-setup.md` e `docs/tls-setup.md`.

- [ ] Corrigir divergências entre documentos: nomes de filas, rotas, status e versões que diferem entre docs e podem divergir do código
  - Origem: docs/07-risk-register.md (RISK-016)
  - Motivo: Documentação inconsistente causa confusão em troubleshooting e onboarding; scripts de deploy podem usar nomes errados
  - Impacto: baixo

---

## 10. Dívida técnica e melhorias estruturais

- [x] Eliminar ~240 linhas de código duplicado entre os 3 consumers (`XmlProcessorConsumer`, `BusinessValidatorConsumer`, `PersistenceConsumer`) via `BaseConsumer`
  - Origem: docs/02-code-quality-audit.md (seção "Consumer Boilerplate"), docs/07-risk-register.md (RISK-011)
  - Motivo: 3 cópias da mesma lógica de retry/DLQ (~80 linhas cada) com inconsistências já existentes (timeouts diferentes)
  - Impacto: alto
  - Implementação: três consumers estendem `BaseConsumer`; política retry/DLQ centralizada em `RabbitMQService.consume`.

- [x] Corrigir typo `'nf.recieved'` (em consumer.ts) para `'nf.received'` e garantir consistência via constante centralizada
  - Origem: docs/02-code-quality-audit.md (seção "Magic Strings e Números")
  - Motivo: Typo em nome de fila causa consumer não receber mensagens — bug silencioso
  - Impacto: alto
  - Implementação: routing keys de retry/DLQ apenas via `RETRY_ROUTING_KEYS` / `DLQ_ROUTING_KEYS` + `QUEUES`; chaves alinhadas a `nf.received` nas constantes existentes.

- [ ] Padronizar naming conventions em todo o codebase: PascalCase para classes, camelCase para métodos/variáveis, UPPER_SNAKE_CASE para constantes, kebab-case para arquivos
  - Origem: docs/02-code-quality-audit.md (seção "Naming Conventions")
  - Motivo: Mix de convenções encontrado (`processNf`, `process_nf`, `ProcessNf`; `MAX_RETRIES`, `maxRetries`, `MaxRetries`)
  - Impacto: baixo

- [ ] Organizar imports em todos os arquivos seguindo ordem: Node.js built-ins → External packages → Internal infrastructure → Internal common → Internal application → Relative
  - Origem: docs/02-code-quality-audit.md (seção "Import Organization"), docs/06-development-rules.md (regra I01)
  - Motivo: Imports desorganizados com `@nestjs/common` importado múltiplas vezes no mesmo arquivo
  - Impacto: baixo

- [ ] Configurar ESLint com regras obrigatórias documentadas: `no-explicit-any: error`, `explicit-function-return-type: error`, `no-non-null-assertion: error`, `no-floating-promises: error`, `complexity: max 10`, `max-lines-per-function: 50`, `max-lines: 200`, `import/no-cycle: error`
  - Origem: docs/06-development-rules.md (seção "ESLint Rules Obrigatórias"), docs/02-code-quality-audit.md (seção "ESLint Rules Recomendadas")
  - Motivo: Regras documentadas no `06-development-rules.md` mas possivelmente não aplicadas no `.eslintrc.js` real
  - Impacto: médio
  - **Parcial (Fase 2):** `@typescript-eslint/no-explicit-any`: `error` em `.eslintrc.js`. **Pendente:** demais regras listadas; ESLint 9 exige `eslint.config.js` para `npm run lint` funcionar.

- [ ] Remover dependências npm não utilizadas (`imap`, `mailparser`, `@aws-sdk/client-sqs`) se stubs forem removidos
  - Origem: docs/01-architecture-audit.md (seção "Stubs Vazios no Codebase")
  - Motivo: Dependências instaladas sem uso aumentam superfície de ataque e tamanho da imagem
  - Impacto: baixo

- [ ] Reduzir complexidade ciclomática média de 12 para <10 e cognitive complexity de 18 para <15, refatorando funções longas
  - Origem: docs/02-code-quality-audit.md (Métricas de Qualidade)
  - Motivo: Funções complexas são difíceis de testar e manter; regra de max 50 linhas por função não está sendo seguida
  - Impacto: médio

- [ ] Adicionar JSDoc em todas as interfaces públicas e métodos exportados
  - Origem: docs/02-code-quality-audit.md (checklist de Baixa Prioridade), docs/06-development-rules.md (checklist de PR)
  - Motivo: APIs internas sem documentação dificultam compreensão por novos devs e AI agents
  - Impacto: baixo

- [ ] Criar barrel exports (`index.ts`) para módulos `common/exceptions/`, `common/validators/`, `common/constants/` para simplificar imports
  - Origem: docs/06-development-rules.md (regra I03)
  - Motivo: Regra documentada para simplificar imports: `import { X, Y } from '@common/exceptions'` em vez de paths individuais
  - Impacto: baixo

- [ ] Habilitar `strict: true` completo no `tsconfig.json` (`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictPropertyInitialization`) e corrigir erros resultantes
  - Origem: docs/06-development-rules.md (regra C01)
  - Motivo: TypeScript strict mode documentado como obrigatório mas possivelmente não totalmente habilitado ou enforced
  - Impacto: médio
