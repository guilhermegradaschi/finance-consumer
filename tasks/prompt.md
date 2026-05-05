Você é um arquiteto de software/planner. Preciso de um PLANO DE IMPLEMENTAÇÃO ponta a ponta para o repositório NestJS `finance-consumer`, alinhado ao checklist em `tasks/checklist-fluxo-nfe-ponta-a-ponta.md` (leia esse arquivo no workspace).

Objetivo: evoluir o sistema de ingestão e processamento de NF-e (multi-fonte: API provider/webhook, polling Qive, IMAP, upload manual, eventos de cancelamento) para o desenho descrito no checklist: staging relacional, S3 antes da fila (sem XML gigante no Rabbit), outbox, exchange topic e routing keys, validação em camadas (well-formed na borda, XSD/assinatura no worker), domínio Invoice unificado ou plano de migração explícito, observabilidade e jobs agendados.

Entregáveis do plano:
1) Fases ordenadas (P0 → P1 → P2) com dependências entre fases.
2) Por fase: escopo, arquivos/módulos prováveis a tocar, riscos e mitigação.
3) Decisões que ainda estão abertas no checklist — liste-as e proponha default com trade-off curto.
4) Estratégia de migração do estado atual (Redis idempotency + `nf_processing_log` + pipeline `NotaFiscal` vs `ExternalInvoice`/`Invoice`): convivência temporária, feature flags, ou corte.
5) Critérios de pronto (definition of done) por fase e testes mínimos (unit, integração, E2E smoke).
6) Estimativa relativa (S/M/L por fase), sem fingir precisão em dias.

Restrições e contexto:
- Não fazer merge para `master` via agente; branches a partir de `master` com padrão `{jira-id}-{slug}` quando houver ticket.
- Preferir mudanças incrementais e reversíveis (feature flags onde fizer sentido).
- Não inventar integrações externas sem citar o que já existe no código (Qive client, IMAP stub, etc.).

Comece lendo `tasks/checklist-fluxo-nfe-ponta-a-ponta.md` e, se necessário, `docs/FLOWS.md` e `docs/00-overview.md` para não contradizer o que já está documentado. Saída em português, markdown com seções claras.