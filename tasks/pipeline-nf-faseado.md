# Pipeline NF Faseado - Implementacao

Plano de implementacao faseado para replicar o pipeline completo de processamento de NF do finance-api no finance-consumer (NestJS).

## Status de Implementacao

### Fase 0 - Base Tecnica (CONCLUIDA)

- [x] Entidades TypeORM: ExternalInvoice, Invoice, InvoiceItem, InvoiceImport, InvoiceImportLog, InvoiceEvent, InvoiceEventsImport
- [x] Enums: ExternalInvoiceStatus, ExternalInvoiceSource, ExternalInvoiceOperation, InvoiceStatus, InvoiceSource, InvoiceIgnoredReason, InvoiceImportStatus, InvoiceEventStatus, InvoiceImportLogStatus
- [x] Migration: PipelineSchema1700000000001
- [x] Clientes HTTP: QiveClient, BuyerApiClient, SellerApiClient (com circuit breaker)
- [x] S3Service estendido: uploadExternalInvoiceXml, uploadInvoiceEventXml, readExternalInvoiceXml
- [x] Filas RabbitMQ: INVOICE_IMPORT_PROCESS, INVOICE_EVENTS_PROCESS, DLQs
- [x] ConfigModule atualizado: QIVE_API_URL/KEY/ID, BUYER_API_URL, SELLER_API_URL, IMAP_USERNAME/PASSWORD

### Fase 1 - Ingestao e Staging (CONCLUIDA)

- [x] XML Parser completo: fast-xml-parser com preserve keys e prefixo @ para atributos
- [x] extractInfNfe com 3 paths (nfeProc.NFe.infNFe, enviNFe.NFe.infNFe, NFe.infNFe)
- [x] Tabela CFOP -> Operacao (invoices-code-operations.ts)
- [x] ExternalInvoiceCreatorService: duplicidade access_key, parse XML, validacao dest, upload S3, extracao campos, swap buyer/seller em devolucao
- [x] QiveImporterService: paginacao cursor, decodificacao base64, InvoiceImport + InvoiceImportLog
- [x] ImapImporterService: estrutura preparada (IMAP real pendente de implementacao)

### Fase 2 - Processamento Principal (CONCLUIDA)

- [x] ExternalInvoicesProcessorService: query por status/periodo/operacao, ensure stuck processing -> error
- [x] InvoiceCreatorService: pipeline completo (XML S3 -> parse -> duplicidade -> buyer/seller -> atributos -> contrato -> items -> SKU -> mp_value)
- [x] InvoiceExtractAttributesService: extracao completa de campos canonicos
- [x] InvoiceItemCreatorService: calculo gross_value, negativacao em devolucao, extracao ICMS (ICMS10/70/40)
- [x] InvoiceVerifyDuplicationService: duplicidade por chave de negocio e access_key
- [x] BuyerService e SellerService: resolucao via APIs externas

### Fase 3 - Cancelamento (CONCLUIDA)

- [x] InvoiceEventCreatorService: criacao idempotente de InvoiceEvent
- [x] InvoiceEventsImporterService: importacao via QiveClient (paginacao cursor)
- [x] InvoiceEventsProcessorService: processamento de eventos pending/error
- [x] InvoiceCanceledCreatorService: marca original como canceled, duplica invoice com valores negativos e operation cancelamento, duplica items com sinais invertidos

### Fase 4 - Paridade Avancada (CONCLUIDA - com stubs para integracao externa)

- [x] PeriodStatusService: estrutura recursiva (TODO: query period_statuses)
- [x] AlreadyBilledInvoiceNumberService: estrutura (TODO: query billing tables)
- [x] InvoiceSkuAssociationService: estrutura com chain de fallback (TODO: query SKU table + AI)
- [x] BuyerAssociationService: match CNPJ completo ou radical (8 chars)
- [x] ContractValidationService: estrutura (TODO: query contracts table)

## Arquivos Criados

### Enums (src/common/enums/)
- external-invoice-status.enum.ts
- external-invoice-source.enum.ts
- external-invoice-operation.enum.ts
- invoice-status.enum.ts
- invoice-source.enum.ts
- invoice-ignored-reason.enum.ts
- invoice-import-status.enum.ts
- invoice-event-status.enum.ts
- invoice-import-log-status.enum.ts

### Entidades (src/modules/persistence/entities/)
- external-invoice.entity.ts
- invoice.entity.ts
- invoice-item.entity.ts
- invoice-import.entity.ts
- invoice-import-log.entity.ts
- invoice-event.entity.ts
- invoice-events-import.entity.ts

### Migrations (src/migrations/)
- 1700000000001-PipelineSchema.ts

### Clientes HTTP (src/infrastructure/http/clients/)
- qive.client.ts
- buyer-api.client.ts
- seller-api.client.ts

### Utils (src/common/)
- utils/xml-parser.util.ts
- constants/invoices-code-operations.ts

### Modulo Invoice Import (src/modules/invoice-import/)
- invoice-import.module.ts
- external-invoice-creator.service.ts
- qive-importer.service.ts
- imap-importer.service.ts

### Modulo Invoice Processor (src/modules/invoice-processor/)
- invoice-processor.module.ts
- external-invoices-processor.service.ts
- invoice-creator.service.ts
- invoice-extract-attributes.service.ts
- invoice-item-creator.service.ts
- invoice-verify-duplication.service.ts
- buyer.service.ts
- seller.service.ts
- period-status.service.ts
- already-billed.service.ts
- invoice-sku-association.service.ts
- buyer-association.service.ts
- contract-validation.service.ts

### Modulo Invoice Events (src/modules/invoice-events/)
- invoice-events.module.ts
- invoice-event-creator.service.ts
- invoice-events-importer.service.ts
- invoice-events-processor.service.ts
- invoice-canceled-creator.service.ts

## Pendencias para Producao

1. **IMAP real**: ImapImporterService.fetchUnseenEmails() esta stub
2. **PeriodStatusService**: isPeriodOpen() precisa de tabela period_statuses
3. **AlreadyBilledInvoiceNumberService**: precisa de tabelas de billing
4. **InvoiceSkuAssociationService**: precisa de tabela SKU + servico AI
5. **ContractValidationService**: precisa de tabela contracts
6. **update_mp_value**: precisa de flag sku.mp para somar valores
7. **ZeroBilling**: invalidacao quando NF processada
8. **Sellin matching**: marcar ignored_reason: replaced_by_invoice
9. **Testes unitarios e de integracao**
10. **Controller de reprocessamento de ExternalInvoice em error**
