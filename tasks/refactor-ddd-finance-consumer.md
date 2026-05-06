# Refactor DDD - finance-consumer

## Princípios da reorganização

- **`git mv` exclusivo**: nenhum arquivo é deletado e recriado; cada movimentação preserva histórico.
- **Comportamento estável**: nenhuma rota, exchange, fila, env, migration ou nome de tabela muda.
- **TypeORM**: o datasource já usa glob `**/*.entity{.ts,.js}` em `src/infrastructure/database/typeorm.config.ts`, então entities podem morar em qualquer pasta sem alterar config.
- **Imports atualizados em massa por busca/troca**: usar caminhos relativos durante a transição; evitar criar novos aliases TS por enquanto.
- **Cada fase é compilável e testável de forma isolada** (PR/commit por fase).

## Estrutura-alvo

```
src/
├── main.ts
├── app.module.ts                    # apenas compõe contexts + infrastructure
├── shared/                          # ex-`common/` (renomeado por clareza DDD)
│   ├── constants/                   # error-codes, queues
│   ├── exceptions/
│   ├── filters/
│   ├── interceptors/
│   ├── middleware/                  # correlation-id
│   ├── correlation/                 # correlation-context
│   ├── pipes/
│   ├── transformers/                # decimal-column
│   ├── utils/                       # hash, xml, xml-parser
│   ├── validation/                  # br-tax-id
│   └── validators/                  # br.decorators
├── infrastructure/
│   ├── database/
│   ├── messaging/
│   │   ├── rabbitmq/
│   │   └── outbox/                  # OutboxMessage entity + OutboxPublisherService
│   ├── redis/
│   ├── s3/
│   ├── http/
│   ├── observability/
│   ├── shutdown/
│   └── scheduling/                  # ScheduleModule wrapper + NfPipelineCronService
├── contexts/
│   ├── platform/                    # auth, health, tokens
│   ├── ingestion/                   # SubmitIngestion + adapters (HTTP, Qive, IMAP, stubs)
│   ├── nfe-legacy/                  # pipeline NotaFiscal legacy
│   ├── invoice/                     # paridade finance-api
│   └── invoice-events/              # eventos NFe
├── migrations/
├── schemas/
├── test/
└── types/
```

## Fases

- **Fase 0** (S): criar árvore vazia + baseline.
- **Fase 1** (S): renomear `common/` -> `shared/`.
- **Fase 2** (S): reorganizar `infrastructure/` (messaging, scheduling).
- **Fase 3** (M): carve out `nfe-legacy` (entities, repos, services, use-cases, consumers, controllers, xml, sefaz).
- **Fase 4** (M): carve out `invoice`.
- **Fase 5** (M): carve out `ingestion`.
- **Fase 6** (S): carve out `invoice-events`.
- **Fase 7** (S): carve out `platform` + dissolver `api-gateway/`, `application/`, `modules/`.
- **Fase 8** (S): docs, lint, smoke.

## Riscos e mitigações

- Circular import `Invoice <-> ExternalInvoice`: ambos no mesmo contexto `invoice`.
- `NfSource` enum compartilhado: manter em `shared/enums/`.
- `OutboxMessage` cross-context: entity em `infrastructure/messaging/outbox/`, importada via `TypeOrmModule.forFeature`.
- Tests `__tests__/`: mover junto com cada `git mv`.

## Critérios globais de pronto

- `yarn build` verde após cada fase.
- `yarn test`, `yarn test:integration`, `yarn test:e2e` verdes ao final.
- `yarn lint` zero erros.
- `git log --follow` mantém histórico nos arquivos movidos.
- Zero diff de comportamento (rotas, exchanges, filas, envs, migrations).
