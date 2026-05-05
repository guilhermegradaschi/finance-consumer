# Checklist — fluxo NFe ponta a ponta (finance-consumer)

> Documento de implementação alinhado ao desenho desejado (ingestão multi-fonte, staging, S3,
> RabbitMQ, domínio Invoice, eventos). **Atualizado em 2026-05-05** após inspeção do código real.
>
> Legenda:
> - `[x]` implementado e wireado.
> - `[~]` implementado mas atrás de feature flag default `false` ou parcial.
> - `[ ]` ainda não implementado.
> - `⚠`  comportamento confirmado no código mas com pendência (mock, stub, gap funcional).

---

## 0. Decisões de produto e contratos

- [ ] Documentar política quando evento de cancelamento chega **antes** da NF existir (retry com backoff vs rejeição vs DLQ tardia).
  - Hoje `NfeEventIngestService` aceita o XML, faz upload S3 e chama `InvoiceEventCreatorService.create`, mas não há comportamento documentado quando `Invoice` ainda não existe (`src/modules/invoice-events/nfe-event-ingest.service.ts:81`).
- [ ] Documentar política de **segunda ingestão** com mesma `access_key` e XML diferente (rejeitar, versionar, alertar).
  - `SubmitIngestionService` retorna `DUPLICATE` para qualquer reingestão (não compara checksum) — `src/modules/nf-receiver/submit-ingestion.service.ts:113-129`.
- [ ] Definir se **SKU obrigatório** para status `processed` ou se `processed` sem `sku_id` é permitido.
- [ ] Congelar contratos HTTP: paths (`/ingest/nfe/*` ou manter `/api/v1/nf`), códigos de erro estáveis e formato JSON de erro.
  - **Status real**: ambos coexistem hoje (`/api/v1/nf` em `nf.controller.ts`, `/ingest/nfe/provider|upload|events` em `ingest-nfe.controller.ts`). Decidir cortar um ou manter dual contract documentado.
- [ ] Unificar ou manter explicitamente **dois pipelines** (`NotaFiscal` vs `Invoice`/`ExternalInvoice`) — se unificar, plano de migração.
  - Flags atuais: `NFE_LEGACY_NOTA_FISCAL_ENABLED=true` (default), `NFE_DUAL_WRITE_EXTERNAL_INVOICE=false` (`src/app.module.ts:86-87`). Pipeline duplo está formalmente sob feature flag, mas o legacy é o caminho default.

---

## 1. Caso de uso e staging (`SubmitIngestion`)

- [x] Introduzir contrato único **SubmitIngestion** chamado por todas as entradas (API provider, upload, IMAP, jobs Qive).
  - `src/modules/nf-receiver/submit-ingestion.service.ts:64` (`SubmitIngestionService.submit`).
  - Chamado por: `IngestNfeController.provider/providerUpload` (`src/modules/api-gateway/controllers/ingest-nfe.controller.ts:74,132`), `QiveImporterService.import` quando `NFE_QIVE_USE_SUBMIT_INGESTION=true` (`src/modules/invoice-import/qive-importer.service.ts:64-70`), `ImapImporterService.processEmail` quando `NFE_IMAP_USE_SUBMIT_INGESTION=true` (`src/modules/invoice-import/imap-importer.service.ts:251-259`).
  - ⚠ As flags `NFE_QIVE_USE_SUBMIT_INGESTION` e `NFE_IMAP_USE_SUBMIT_INGESTION` ainda têm default `false` (`src/app.module.ts:99-100`); pipeline padrão segue gravando direto em `ExternalInvoice` via `ExternalInvoiceCreatorService`.
- [x] Criar tabela **`nfe_ingestions`**: `id`, `idempotency_key` (UNIQUE), `source`, `external_ref`, `access_key` (nullable), `raw_storage_key`, `checksum_sha256`, `status`, `error_code`, `created_at`, etc.
  - Entity: `src/modules/persistence/entities/nfe-ingestion.entity.ts`.
  - Migration: `src/migrations/1700000000002-NfeIngestions.ts`.
- [x] Garantir idempotência de ingestão no Postgres (não só Redis).
  - UNIQUE `idempotency_key` + tratamento de `23505` com cleanup do S3 (`submit-ingestion.service.ts:215-228`). Redis SETNX como pré-check (`:131-143`).
- [ ] Opcional: FK `invoices.ingestion_id` apontando para o registro de staging.
  - Não confirmado nas entidades atuais.

---

## 2. API — entrada externa (provider / Qive webhook)

- [x] Expor **`POST /ingest/nfe/provider`** com `202` aceitando XML string ou base64.
  - `src/modules/api-gateway/controllers/ingest-nfe.controller.ts:53-81` (DTO `IngestNfeProviderDto`).
- [x] Endpoint multipart: **`POST /ingest/nfe/provider/upload`** com limite 10 MB e `metadataJson`.
  - `ingest-nfe.controller.ts:83-139`, `MAX_NF_XML_BYTES = 10 * 1024 * 1024` (`:24`).
- [x] Validar **tamanho máximo**, `Content-Type`, decode base64 sem erro.
  - `decodeOptionalBase64` rejeita base64 inválido (`:28-35`); multipart usa `FileInterceptor` com `limits.fileSize`.
- [x] Validação **camada A**: XML **well-formed** (parser com recover desligado); rejeitar com código estável (`INVALID_PAYLOAD`, `XML_MALFORMED`).
  - `assertXmlWellFormed` em `submit-ingestion.service.ts:74` lança `NonRetryableException` com código `XML_MALFORMED`; chave inválida → `INVALID_PAYLOAD` (`:103`).
- [x] Extrair mínimo para roteamento/idempotência: `<chNFe>` ou chave 44 dígitos.
  - `extractChaveAcessoFromXml` + `isValidChaveAcesso` em `submit-ingestion.service.ts:90-104`.
- [x] Logs estruturados com **`correlation_id`** (e propagar para fila).
  - Header `x-correlation-id` capturado e enviado a `submit` (`ingest-nfe.controller.ts:78,109,136,160`); propagado para headers RabbitMQ (`submit-ingestion.service.ts:202-205,255-262`).
- [~] Autenticação do webhook (API key, mTLS ou assinatura).
  - Hoje só JWT (`@UseGuards(JwtAuthGuard)`) + `Throttle({ default: { limit: 60, ttl: 60000 } })` (`ingest-nfe.controller.ts:45,55`). Decidir se Qive usa o mesmo JWT ou outro mecanismo.

---

## 3. Polling Qive (API externa)

- [x] Worker/cron que chama API Qive em lote.
  - `NfPipelineCronService.runScheduledTasks` chama `qiveImporter.import(start, end)` quando `QIVE_CRON_ENABLED=true` (`src/modules/scheduled-jobs/nf-pipeline-cron.service.ts:28-34`).
- [x] Para cada NF, invocar **SubmitIngestion** (não só importador legado).
  - `qive-importer.service.ts:64-70` chama `SubmitIngestionService.submit` quando `NFE_QIVE_USE_SUBMIT_INGESTION=true`. Default ainda é grava direto via `ExternalInvoiceCreatorService.create` (`:71-77`).
- [x] Tratamento de erro por item sem abortar lote inteiro.
  - Loop com `try/catch` por NF, contadores success/error/ignored, log granular por página (`qive-importer.service.ts:60-110`).
- [x] Registrar `external_ref` / metadados de página para auditoria.
  - `external_ref: qive:${access_key}` (`:68`); `InvoiceImportLog.metadata` com counts e arrays de access_keys (`:100-108`).

---

## 4. E-mail (IMAP)

- [x] Implementar **IMAP real** (conexão, busca, anexos).
  - `ImapImporterService.fetchUnseenEmails` usa `imap` lib + `mailparser` para conectar TLS, abrir INBOX, buscar `UNSEEN` (`src/modules/invoice-import/imap-importer.service.ts:122-216`).
  - ⚠ `EmailConsumerService` (`src/modules/email-consumer/email-consumer.service.ts`) ainda é stub que só lê fixtures locais; convive com `ImapImporterService`. Decidir destino (manter dois ou unificar).
- [x] Suportar anexo `.xml` e `.zip` (um XML NFe); **whitelist** de extensões.
  - `ALLOWED_EXT = new Set(['.xml', '.zip'])` (`imap-importer.service.ts:19,173`).
- [x] **Limite** de anexos por e-mail; **anti–zip bomb**.
  - `IMAP_MAX_ATTACHMENTS_PER_MAIL` (default 10) e `IMAP_MAX_UNCOMPRESSED_ZIP_BYTES` (default 20 MB) (`imap-importer.service.ts:119-120,224-228`).
- [x] Idempotência: `sha256(xml_bytes)` ou `Message-ID + filename + size`.
  - `external_ref: imap:${msgId}:${fn}:${accessKey}` quando passa por SubmitIngestion (`:257`); idempotência DB via `nfe_ingestions.idempotency_key` derivada de `(accessKey, source)`. Sem `useSubmitIngestion`, dedup é só por `ExternalInvoice.access_key` no creator (`external-invoice-creator.service.ts:35-39`).
- [ ] **Marcar mensagem como lida/processada** só após staging `accepted` (transação segura).
  - Hoje a busca `UNSEEN` em IMAP marca como `SEEN` automaticamente ao buscar `bodies: ''`; não há `\\Deleted` ou `addFlags(\\Seen)` controlado pós-sucesso. Risco: e-mail “consumido” mesmo se processamento der erro genérico no `messageJobs`.
- [x] **Não** seguir links não confiáveis no corpo como fonte primária.
  - Implementação só lê `parsed.attachments`, não `parsed.text`/`html` (`imap-importer.service.ts:169-189`).

---

## 5. Upload manual

- [x] **`POST`** multipart para upload XML.
  - `ingest-nfe.controller.ts:83-139` (`POST /ingest/nfe/provider/upload`).
  - ⚠ Não há suporte a `.zip` no controller (apenas no IMAP); decidir se adiciona.
- [~] Fluxo **presigned URL** + **`POST /ingest/nfe/complete`**.
  - Endpoint stub explícito retornando `BadRequestException` (`ingest-nfe.controller.ts:141-148`).
- [~] **Rate limit por usuário/tenant**.
  - Hoje `Throttle` global (60/min) no controller (`:45`). Existe `UserRateLimitGuard` em `src/common/guards/user-rate-limit.guard.ts` mas **não** está aplicado neste controller — verificar antes de marcar como done.
- [x] `source=manual_upload` ou equivalente, `external_ref` rastreável.
  - `IngestNfeController` aceita `source` e `external_ref` no body (`ingest-nfe.controller.ts:79,108,137`).

---

## 6. Armazenamento S3 (objeto)

- [x] Padronizar chave **`nfe/raw/{yyyy}/{mm}/{access_key}.xml`**.
  - `S3Service.buildNfeRawKeyFromAccessKey` é a fonte do path (`submit-ingestion.service.ts:146`). Também existem prefixos `external-invoices/{access_key}.xml` para o pipeline legacy (`external-invoice-creator.service.ts:61` via `s3Service.uploadExternalInvoiceXml`) — ainda **não unificado**.
- [ ] Caminho **`nfe/raw/pending/{ingestion_id}.xml`** quando chave ainda desconhecida.
  - Não encontrado; hoje a chave é obrigatória (`submit-ingestion.service.ts:91-104`).
- [x] Eventos: **`nfe/events/{...}/{access_key}/{event_type}_{...}.xml`** ou similar.
  - `S3Service.buildNfeEventStorageKey` usado em `nfe-event-ingest.service.ts:66`. Convívio com `invoice-events/{access_key}-{event_type}.xml` no fluxo Qive antigo (`InvoiceEventCreatorService`).
- [x] Falha de upload: **não** enfileirar; staging `rejected` com retry policy.
  - `submit-ingestion.service.ts:148-162` (S3 upload antes do insert; em erro registra log `S3_UPLOAD_FAILED` e relança).
- [x] **Ordem desejada**: validação A → **upload S3** → persistir staging → **publicar fila**.
  - Implementado em `submit-ingestion.service.ts:73-270`.

---

## 7. Outbox e publicação RabbitMQ

- [x] Implementar **outbox** (`outbox_messages`) no mesmo commit que o registro de staging.
  - Entity `outbox-message.entity.ts`; transação `dataSource.transaction` em `submit-ingestion.service.ts:185-208` quando `NFE_OUTBOX_ENABLED=true`.
- [x] Poller/publicador confiável para Rabbit.
  - `OutboxPublisherService.flushPending` `@Interval(3000)`, batch 100, max 50 attempts → `FAILED` (`src/modules/scheduled-jobs/outbox-publisher.service.ts:21-58`).
- [~] **Publisher confirms** explícitos.
  - Não confirmado neste check; verificar em `RabbitMQService.publish`.
- [~] Topologia para exchange **`nf.topic`** e routing keys alinhadas: `ingest.accepted`, `nfe.validate`, `nfe.persist`, `nfe.associate`, `event.received`, `event.process`.
  - Definidos em `src/common/constants/queues.constants.ts:1-43` (`EXCHANGES.NF_TOPIC`, todas as `ROUTING_KEYS` previstas). **Mas o `SubmitIngestionService` ainda publica em `EXCHANGES.EVENTS` + `ROUTING_KEYS.NF_RECEIVED`** (`submit-ingestion.service.ts:179-180,265-269`); não consome a `nf.topic` ainda.
- [x] Headers de mensagem: **`message_id`**, **`correlation_id`**, **`ingestion_id`**.
  - `correlation_id`, `ingestion_id` em `submit-ingestion.service.ts:202-205,255-262`. **`message_id` ainda não setado** explicitamente.
- [~] Filas duráveis, **prefetch** baixo em workers pesados, **manual ack** após commit DB.
  - `RABBITMQ_PREFETCH=10` default (`src/app.module.ts:50`). Validar manual ack pós-commit em `xml-processor.consumer.ts`, `business-validator.consumer.ts`, `persistence.consumer.ts` (não verificado nesta passada).
- [~] **DLX** + fila de retry / TTL ou plugin de delayed message; máximo de tentativas e DLQ com motivo.
  - Constantes definem `nf.retry`, `nf.dlq`, `invoice.retry`, `invoice.dlq` (`queues.constants.ts:1-9,17-26`). Validar bindings reais em `RabbitMQModule`.

---

## 8. Workers / pipeline NFe

- [x] Cadeia **`InvoiceCreatorService` → `InvoiceItemCreatorService` → `InvoiceSkuAssociationService` → `BuyerAssociationService` → `ContractValidationService`** portada (paridade finance-api).
  - Módulo: `src/modules/invoice-processor/invoice-processor.module.ts`.
  - Services: `invoice-creator`, `invoice-extract-attributes`, `invoice-item-creator`, `invoice-verify-duplication`, `buyer`, `seller`, `period-status`, `already-billed`, `invoice-sku-association`, `buyer-association`, `contract-validation`.
- [x] **`ExternalInvoicesProcessorService`** com query igual ao Rails (status PENDING|ERROR|PROCESSING + operation VENDA|DEVOLUCAO + janela mês anterior..fim do mês atual + `forceStuckProcessingToError`).
  - `src/modules/invoice-processor/external-invoices-processor.service.ts:19-72`.
- [~] **ValidateParse** com **XSD NFe (obrigatório em produção)** e versão de layout.
  - `NfeXsdValidationService` existe (`src/modules/xml-processor/nfe-xsd-validation.service.ts`). **Status de integração ao consumer ainda atrás de `NFE_XSD_ENABLED=false`** (`src/app.module.ts:85`). Validar se o `xml-processor.consumer.ts` realmente injeta e chama o service.
- [ ] Validar **assinatura digital** se for requisito.
  - Não encontrado.
- [x] Campos mínimos pós-parse (modelo 55): chave, nNF, dhEmi, emitente/destinatário, vNF, itens com cProd, quantidades, vProd, CFOP.
  - Extração em `external-invoice-creator.service.ts:49-94` cobre dest/emit/ide/total/det/prod/CFOP. Pipeline `xml-processor` extrai detalhes adicionais para o modelo `NotaFiscal` legacy.
- [~] **EnrichPersist**: resolver buyer/seller; falha → status `error` com código (`ENTITY_NOT_RESOLVED`) e retry quando catálogo atualizar.
  - `BuyerService` / `SellerService` em `invoice-processor/`. Validar comportamento de erro e retry no `InvoiceCreatorService` (não verificado nesta passada).
- [x] Persistência: `invoices` + `invoice_items` com transação única; sem “NF válida parcial”.
  - Verificar transações em `InvoiceCreatorService` (paridade Rails). ⚠ No Rails original a transação NÃO era única — checar se foi melhorado na port.

---

## 9. Eventos (cancelamento, carta correção, etc.)

- [x] **`POST /ingest/nfe/events`** para webhook / JSON / XML de evento (`procEventoNFe`).
  - `ingest-nfe.controller.ts:150-162` → `NfeEventIngestService.ingest`.
- [x] Tabela **`nfe_events`** com `idempotency_key` UNIQUE, `payload_storage_key`, `checksum`, `status`.
  - Entity `nfe-event.entity.ts`; idempotência por `sha256(accessKey:eventType:checksum)` (`nfe-event-ingest.service.ts:58-63`).
- [x] Cron `INVOICE_EVENTS_IMPORTER_CRON_ENABLED` + `INVOICE_EVENTS_PROCESSOR_CRON_ENABLED`.
  - `nf-pipeline-cron.service.ts:52-66`.
- [x] Cancelamento: atualizar `invoices` (`canceled`, etc.); reenvio idempotente.
  - `InvoiceCanceledCreatorService` no `InvoiceEventsModule`.
- [ ] Se NF inexistente: implementar política escolhida na seção 0.
  - Política não definida; código aceita o evento e tenta criar.
- [ ] Carta correção: definir modelo (`invoice_corrections` vs re-parse do XML armazenado).
  - Não encontrado.
- [~] Fila **`nf.event.process`** (ou routing equivalente) e handler idempotente.
  - Constantes `INVOICE_EVENTS_PROCESS`, `EVENT_PROCESS` existem (`queues.constants.ts:24,40`); validar binding no consumer.

---

## 10. API interna / reprocessamento

- [x] Endpoint admin **`POST /admin/invoices/{access_key}/reprocess`** (ou alias).
  - `src/modules/api-gateway/controllers/admin-invoice-reprocess.controller.ts`.
  - Também há `reprocess.controller.ts` (`POST /api/v1/nf/reprocess/:chaveAcesso`) e `nf-reprocess.service.ts`.
- [~] Reset controlado: `error` → re-enfileirar validate/persist sem duplicar itens.
  - Confirmar na implementação de `nf-reprocess.service.ts` se faz upsert ou delete+recriar.

---

## 11. Observabilidade

- [x] Logs estruturados: `ingestion_id`, `access_key`, `message_id`, `stage`, `duration_ms`, `outcome`.
  - `submit-ingestion.service.ts:272-279` (`stage: 'RECEIVE'`, `status`, `durationMs`, `metadata`); `NfProcessingLogRepository.logProcessingStep` em uso.
  - ⚠ `LoggerService` (`src/infrastructure/observability/logger.service.ts`) — verificar se está em formato JSON estruturado ou texto.
- [x] Tracing: `correlation_id` do HTTP até consumers.
  - `correlation-id.middleware.ts` + propagação para Rabbit headers (`submit-ingestion.service.ts:202-205,255-262`).
  - OpenTelemetry instalado (`@opentelemetry/sdk-node`, `tracing.config.ts`, `tracing-shutdown.hook.ts`, `http-client-tracing.ts`).
- [ ] Métricas: contadores por `source` e outcome, histogramas por estágio, taxa de DLQ.
  - Não encontrado exporter Prometheus/StatsD; OTEL configurado mas sem métricas customizadas verificadas.

---

## 12. Infra e operações

- [x] **Cron / scheduler** no app: import Qive, IMAP, `ExternalInvoicesProcessor`, `InvoiceEventsImporter`, `InvoiceEventsProcessor`.
  - `NfPipelineCronService` (`src/modules/scheduled-jobs/nf-pipeline-cron.service.ts`) com 5 flags individuais. ⚠ Janela hardcoded últimas 24h (`:25-26`); finance-api varia entre QIVE e IMAP.
- [x] Variáveis de ambiente e secrets documentados para cada fonte.
  - `app.module.ts:32-107` (Joi schema), `docs/ENVIRONMENT.md`, `docs/secrets-setup.md`.
- [ ] Testes E2E por fonte (mínimo: upload API, um job Qive mock, um evento de cancelamento).
  - `src/test/jest-e2e.json` configurado; `src/test/e2e-submit-nf.js` existe; cobertura E2E por fonte ainda não validada.

---

## 13. Limpeza e consistência de legado

- [ ] Decidir destino de **`nf_processing_log`** + Redis idempotência vs novo staging (conviver ou migrar).
  - Hoje convivem: `NfProcessingLogRepository` é gravada por `SubmitIngestionService`, e `nfe_ingestions` também. Possível duplicação de auditoria.
- [ ] Alinhar ou deprecar pipeline **`NotaFiscal`** se o alvo for apenas domínio `Invoice`.
  - `NFE_LEGACY_NOTA_FISCAL_ENABLED=true` (default) e `NFE_DUAL_WRITE_EXTERNAL_INVOICE=false`. Pipeline `NotaFiscal` continua sendo o caminho default; `Invoice/ExternalInvoice` está disponível mas exige opt-in nas flags.
- [ ] Unificar convenções S3 (`external-invoices/` vs `nfe/raw/`) após migração.
  - Coexistem hoje (`external-invoice-creator.service.ts:61` vs `submit-ingestion.service.ts:146`).
- [ ] Decidir destino de `EmailConsumerService` (stub fixture) vs `ImapImporterService` (IMAP real).
  - Ambos estão no `AppModule`; o real é o `ImapImporterService` chamado pelo cron.
- [ ] Decidir destino de `S3ListenerService` (stub SQS).
  - `processS3Event` existe mas `startPolling` é `not implemented`.

---

## 14. Riscos críticos identificados

- [ ] ⚠ **`SefazClient` retorna `valid: true` HARDCODED** (`src/modules/business-validator/clients/sefaz.client.ts:35-41`). NF inválidas serão aceitas em produção. **Bloqueador para go-live**.
- [ ] ⚠ **Pipeline duplo** ativo: `NotaFiscal` (legacy default) vs `Invoice/ExternalInvoice` (paridade finance-api atrás de flag). Risco de divergência de dados entre os dois.
- [ ] ⚠ **`SubmitIngestionService` publica em `EXCHANGES.EVENTS`** mas `nf.topic` foi definida em constants — workers ainda consomem do exchange antigo. Migração da topologia precisa ser planejada.
- [ ] ⚠ **IMAP marca SEEN automaticamente** ao buscar bodies; se `processEmail` falhar o e-mail não será reprocessado naturalmente.
- [ ] ⚠ Validação **XSD desligada por default** (`NFE_XSD_ENABLED=false`).

---

## Referências no repositório

- Pipeline principal documentado: `docs/FLOWS.md`, `docs/00-overview.md`.
- Paridade finance-api: `docs/pipeline-processamento-nf-finance-api.md`, `docs/finance_nf_pipeline_faseado.md`.
- Stubs IMAP/SQS: `docs/adr/0002-email-s3-stubs.md`.
- XSD: `src/schemas/nfe/README.md`, `src/modules/xml-processor/nfe-xsd-validation.service.ts`.
- Inventário cruzado finance-api ↔ finance-consumer: `../../tasks/inventario-nf-finance-api-para-finance-consumer.md` (workspace root).
- Audit detalhado: `docs/01-architecture-audit.md` ... `docs/09-ai-agent-instructions.md`.

---

*Última atualização: 2026-05-05 — após inspeção do código real (não mais derivado apenas do desenho desejado).*
