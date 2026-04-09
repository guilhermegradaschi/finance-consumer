# 07 - Registro de Riscos

## Metodologia de Avaliação

### Matriz de Impacto × Probabilidade

```
                    PROBABILIDADE
              Baixa    Média    Alta
         ┌─────────┬─────────┬─────────┐
   Alto  │  MÉDIO  │  ALTO   │ CRÍTICO │
IMPACTO  ├─────────┼─────────┼─────────┤
   Médio │  BAIXO  │  MÉDIO  │  ALTO   │
         ├─────────┼─────────┼─────────┤
   Baixo │  BAIXO  │  BAIXO  │  MÉDIO  │
         └─────────┴─────────┴─────────┘
```

### Escalas

**Probabilidade**:
- **Baixa (1)**: < 20% de chance de ocorrer
- **Média (2)**: 20-60% de chance de ocorrer
- **Alta (3)**: > 60% de chance de ocorrer

**Impacto**:
- **Baixo (1)**: Inconveniência menor, workaround disponível
- **Médio (2)**: Degradação de serviço, requer intervenção
- **Alto (3)**: Falha crítica, perda de dados, violação de segurança

---

## Riscos Críticos (Ação Imediata Requerida)

### RISK-001: SEFAZ Mock em Produção

| Campo | Valor |
|-------|-------|
| **ID** | RISK-001 |
| **Categoria** | Funcionalidade |
| **Descrição** | SefazClient retorna sempre `AUTORIZADA` sem consultar SEFAZ real. NF-e inválidas, canceladas ou inexistentes são aceitas como válidas. |
| **Probabilidade** | Alta (3) |
| **Impacto** | Alto (3) |
| **Score** | 🔴 CRÍTICO (9) |
| **Arquivos Afetados** | `src/modules/business-validator/clients/sefaz.client.ts` |
| **Sinal de Alerta** | - Qualquer NF-e é aceita independente do status real<br>- Logs mostram status=AUTORIZADA para todas as NF-e |
| **Mitigação** | 1. Bloquear deploy em produção até implementar integração real<br>2. Adicionar feature flag SEFAZ_MOCK=true apenas em dev/staging<br>3. Alerta se SEFAZ_MOCK=true em produção |
| **Contingência** | Rollback imediato + auditoria de NF-e processadas |
| **Owner** | Tech Lead |
| **Prazo** | IMEDIATO - Bloquear produção |

---

### RISK-002: JWT Secret Exposto

| Campo | Valor |
|-------|-------|
| **ID** | RISK-002 |
| **Categoria** | Segurança |
| **Descrição** | JWT_SECRET está hardcoded em .env.example com valor "dev-secret-key-change-in-production". Se usado em produção, qualquer pessoa pode forjar tokens válidos. |
| **Probabilidade** | Média (2) |
| **Impacto** | Alto (3) |
| **Score** | 🔴 CRÍTICO (6) |
| **Arquivos Afetados** | `.env.example`, `src/config/auth.config.ts` |
| **Sinal de Alerta** | - Tokens de usuários desconhecidos sendo aceitos<br>- Atividade anômala em horários incomuns<br>- JWT_SECRET em logs ou error messages |
| **Mitigação** | 1. Remover default value do JWT_SECRET<br>2. Validação em startup rejeitando secrets fracos<br>3. Rotação de secrets via External Secrets Operator |
| **Contingência** | Rotação imediata do secret + invalidação de todos os tokens + auditoria de acessos |
| **Owner** | Security Lead |
| **Prazo** | 24 horas |

---

### RISK-003: Secrets K8s com Placeholders

| Campo | Valor |
|-------|-------|
| **ID** | RISK-003 |
| **Categoria** | Infraestrutura |
| **Descrição** | k8s/secret.yaml contém valores "REPLACE_ME" base64 encoded. Deploy pode usar esses placeholders ou falhar silenciosamente. |
| **Probabilidade** | Alta (3) |
| **Impacto** | Alto (3) |
| **Score** | 🔴 CRÍTICO (9) |
| **Arquivos Afetados** | `k8s/secret.yaml` |
| **Sinal de Alerta** | - Pods em CrashLoopBackOff<br>- Erros de conexão com DB/RabbitMQ<br>- Valores "REPLACE_ME" em logs de erro |
| **Mitigação** | 1. Migrar para External Secrets Operator<br>2. CI verifica ausência de "REPLACE_ME" em manifests<br>3. Admission webhook rejeita secrets suspeitos |
| **Contingência** | Fix manual de secrets via kubectl + redeploy |
| **Owner** | DevOps |
| **Prazo** | Antes do primeiro deploy |

---

### RISK-004: Health Check Falso Positivo

| Campo | Valor |
|-------|-------|
| **ID** | RISK-004 |
| **Categoria** | Operacional |
| **Descrição** | /health/ready sempre retorna OK sem verificar DB, Redis ou RabbitMQ. Kubernetes roteia tráfego para pods com dependências quebradas. |
| **Probabilidade** | Alta (3) |
| **Impacto** | Alto (3) |
| **Score** | 🔴 CRÍTICO (9) |
| **Arquivos Afetados** | `src/modules/api-gateway/controllers/health.controller.ts` |
| **Sinal de Alerta** | - Pods "Ready" mas requisições falham<br>- Erros de conexão em logs mas pod não restarta<br>- Latência alta sem escala automática |
| **Mitigação** | 1. Implementar verificações reais de todas as dependências<br>2. Timeout de 5s para cada check<br>3. Retornar 503 se qualquer dependência falhar |
| **Contingência** | kubectl delete pod forçado + investigação manual |
| **Owner** | Backend Lead |
| **Prazo** | 48 horas |

---

## Riscos Altos

### RISK-005: Ausência de Observabilidade

| Campo | Valor |
|-------|-------|
| **ID** | RISK-005 |
| **Categoria** | Operacional |
| **Descrição** | Métricas são coletadas in-memory mas não exportadas. Não há tracing distribuído. Alertas não configurados. Incidentes são detectados por usuários. |
| **Probabilidade** | Alta (3) |
| **Impacto** | Médio (2) |
| **Score** | 🟠 ALTO (6) |
| **Arquivos Afetados** | `src/infrastructure/observability/` |
| **Sinal de Alerta** | - Incidentes reportados por clientes antes de SRE<br>- MTTD (Mean Time To Detect) > 30 min<br>- Troubleshooting requer acesso direto a pods |
| **Mitigação** | 1. Implementar OpenTelemetry<br>2. Configurar alertas para: error rate, latência P99, queue depth |
| **Contingência** | Acesso manual via kubectl logs + describe |
| **Owner** | SRE |
| **Prazo** | 1 semana |

---

### RISK-006: Falta de Validação XSD

| Campo | Valor |
|-------|-------|
| **ID** | RISK-006 |
| **Categoria** | Integridade de Dados |
| **Descrição** | XMLs são parseados sem validação contra schema XSD. XMLs malformados ou com estrutura incorreta passam pelo pipeline e causam erros downstream ou dados incorretos. |
| **Probabilidade** | Média (2) |
| **Impacto** | Alto (3) |
| **Score** | 🟠 ALTO (6) |
| **Arquivos Afetados** | `src/modules/xml-processor/xml-processor.service.ts` |
| **Sinal de Alerta** | - Erros de parse em stages posteriores<br>- NF-e com campos nulos que deveriam ser obrigatórios<br>- Divergência entre dados processados e XML original |
| **Mitigação** | 1. Adicionar validação XSD antes do parse<br>2. Rejeitar XMLs inválidos com erro claro<br>3. Logs com detalhes da validação falha |
| **Contingência** | Reprocessamento manual de NF-e afetadas |
| **Owner** | Backend Lead |
| **Prazo** | 2 semanas |

---

### RISK-007: CORS Aberto

| Campo | Valor |
|-------|-------|
| **ID** | RISK-007 |
| **Categoria** | Segurança |
| **Descrição** | app.enableCors() sem opções permite requisições de qualquer origem. Facilita ataques CSRF e exfiltração de dados via JavaScript malicioso. |
| **Probabilidade** | Média (2) |
| **Impacto** | Alto (3) |
| **Score** | 🟠 ALTO (6) |
| **Arquivos Afetados** | `src/main.ts` |
| **Sinal de Alerta** | - Requisições de origens desconhecidas em logs<br>- Origin headers suspeitos<br>- Relatórios de usuários sobre phishing |
| **Mitigação** | 1. Configurar lista explícita de origens permitidas<br>2. Diferentes configs para dev/staging/prod<br>3. Logging de requisições bloqueadas por CORS |
| **Contingência** | Bloquear todas as origens temporariamente + investigação |
| **Owner** | Security Lead |
| **Prazo** | 48 horas |

---

### RISK-008: Perda de Precisão Decimal

| Campo | Valor |
|-------|-------|
| **ID** | RISK-008 |
| **Categoria** | Integridade de Dados |
| **Descrição** | decimalTransformer converte decimal do DB para number JavaScript, que tem precisão limitada (~15 dígitos). Valores financeiros podem perder centavos. |
| **Probabilidade** | Média (2) |
| **Impacto** | Alto (3) |
| **Score** | 🟠 ALTO (6) |
| **Arquivos Afetados** | `src/modules/persistence/entities/*.ts` |
| **Sinal de Alerta** | - Diferenças em reconciliação contábil<br>- Soma de itens ≠ total da NF-e<br>- Valores terminando em .9999999 ou .0000001 |
| **Mitigação** | 1. Usar Decimal.js para todos os valores monetários<br>2. Serializar como string no JSON<br>3. Testes de precisão com valores grandes |
| **Contingência** | Correção manual de registros afetados + reprocessamento |
| **Owner** | Backend Lead |
| **Prazo** | 1 semana |

---

### RISK-009: Rate Limit Global Insuficiente

| Campo | Valor |
|-------|-------|
| **ID** | RISK-009 |
| **Categoria** | Disponibilidade |
| **Descrição** | Rate limit é global (100 req/min total), não por usuário. Um único usuário pode consumir toda a cota, causando DoS para outros. |
| **Probabilidade** | Média (2) |
| **Impacto** | Médio (2) |
| **Score** | 🟠 ALTO (4) |
| **Arquivos Afetados** | `src/main.ts`, throttler config |
| **Sinal de Alerta** | - 429 frequentes para múltiplos usuários<br>- Um usuário com volume muito maior que média<br>- Reclamações de "serviço lento" de vários clientes |
| **Mitigação** | 1. Implementar rate limit por usuário (JWT sub)<br>2. Rate limit por IP para endpoints públicos<br>3. Diferentes limites por tier de usuário |
| **Contingência** | Bloquear usuário abusivo manualmente |
| **Owner** | Backend Lead |
| **Prazo** | 2 semanas |

---

### RISK-010: Falta de PodDisruptionBudget

| Campo | Valor |
|-------|-------|
| **ID** | RISK-010 |
| **Categoria** | Disponibilidade |
| **Descrição** | Sem PDB, kubectl drain pode derrubar todos os pods simultaneamente durante manutenção de nodes, causando downtime. |
| **Probabilidade** | Média (2) |
| **Impacto** | Alto (3) |
| **Score** | 🟠 ALTO (6) |
| **Arquivos Afetados** | `k8s/` (falta pdb.yaml) |
| **Sinal de Alerta** | - Downtime durante manutenção de cluster<br>- Todos os pods terminando simultaneamente<br>- Alertas de zero replicas |
| **Mitigação** | 1. Criar PDB com minAvailable: 2<br>2. Configurar anti-affinity para spread entre nodes<br>3. Testar drain em staging |
| **Contingência** | Escalar manualmente durante manutenção |
| **Owner** | DevOps |
| **Prazo** | 1 semana |

---

## Riscos Médios

### RISK-011: Consumer Retry Logic Duplicada

| Campo | Valor |
|-------|-------|
| **ID** | RISK-011 |
| **Categoria** | Manutenibilidade |
| **Descrição** | Cada consumer reimplementa lógica de retry/DLQ. Correções em um não são propagadas. Comportamento pode divergir entre consumers. |
| **Probabilidade** | Alta (3) |
| **Impacto** | Baixo (1) |
| **Score** | 🟡 MÉDIO (3) |
| **Arquivos Afetados** | `src/modules/*/consumers/*.consumer.ts` |
| **Sinal de Alerta** | - Comportamento diferente de retry entre stages<br>- Bug corrigido em um consumer reaparece em outro<br>- Dificuldade para adicionar features cross-cutting |
| **Mitigação** | 1. Criar BaseConsumer abstrato<br>2. Migrar todos os consumers<br>3. Code review para evitar reimplementação |
| **Contingência** | Fix pontual em cada consumer afetado |
| **Owner** | Backend Lead |
| **Prazo** | 3 semanas |

---

### RISK-012: Stubs Vazios em Produção

| Campo | Valor |
|-------|-------|
| **ID** | RISK-012 |
| **Categoria** | Estabilidade |
| **Descrição** | EmailConsumerService e S3ListenerService são stubs que lançam "Not implemented". Se feature flags habilitarem, serviço crashea. |
| **Probabilidade** | Baixa (1) |
| **Impacto** | Alto (3) |
| **Score** | 🟡 MÉDIO (3) |
| **Arquivos Afetados** | `src/modules/email-consumer/`, `src/modules/s3-listener/` |
| **Sinal de Alerta** | - CrashLoopBackOff após mudar IMAP_ENABLED=true<br>- "Not implemented" em logs<br>- Serviço inicia e morre imediatamente |
| **Mitigação** | 1. Remover stubs ou implementar completamente<br>2. Validação em startup verifica configuração<br>3. Testes de smoke com feature flags |
| **Contingência** | Reverter feature flag + hotfix |
| **Owner** | Tech Lead |
| **Prazo** | 4 semanas (decisão) |

---

### RISK-013: JwtAuthGuard Manual

| Campo | Valor |
|-------|-------|
| **ID** | RISK-013 |
| **Categoria** | Segurança |
| **Descrição** | JwtAuthGuard implementa verificação manual em vez de usar passport-jwt. Não valida issuer, audience ou algorithm, permitindo tokens de outros sistemas. |
| **Probabilidade** | Média (2) |
| **Impacto** | Médio (2) |
| **Score** | 🟡 MÉDIO (4) |
| **Arquivos Afetados** | `src/common/guards/jwt-auth.guard.ts` |
| **Sinal de Alerta** | - Tokens de outros serviços aceitos<br>- Algorithm confusion attacks<br>- Tokens sem claims obrigatórios aceitos |
| **Mitigação** | 1. Migrar para passport-jwt Strategy<br>2. Validar issuer e audience<br>3. Forçar algorithm HS256 |
| **Contingência** | Fix emergencial no guard existente |
| **Owner** | Backend Lead |
| **Prazo** | 1 semana |

---

### RISK-014: TLS Não Configurado

| Campo | Valor |
|-------|-------|
| **ID** | RISK-014 |
| **Categoria** | Segurança |
| **Descrição** | Ingress não configura TLS. Tráfego pode ser interceptado em trânsito. Dados sensíveis (NF-e, tokens) expostos em plain text. |
| **Probabilidade** | Média (2) |
| **Impacto** | Alto (3) |
| **Score** | 🟠 ALTO (6) |
| **Arquivos Afetados** | `k8s/ingress.yaml` |
| **Sinal de Alerta** | - Acesso via HTTP funciona<br>- Certificado inválido ou ausente<br>- Browsers mostram "Not Secure" |
| **Mitigação** | 1. Configurar cert-manager<br>2. Adicionar TLS no Ingress<br>3. Redirect HTTP → HTTPS |
| **Contingência** | Bloquear HTTP no load balancer |
| **Owner** | DevOps |
| **Prazo** | 48 horas |

---

## Riscos Baixos

### RISK-015: Repositories Desnecessários

| Campo | Valor |
|-------|-------|
| **ID** | RISK-015 |
| **Categoria** | Manutenibilidade |
| **Descrição** | Repositories custom apenas wrappam TypeORM Repository sem adicionar valor. Código boilerplate que aumenta manutenção. |
| **Probabilidade** | Alta (3) |
| **Impacto** | Baixo (1) |
| **Score** | 🟢 BAIXO (3) |
| **Arquivos Afetados** | `src/modules/persistence/repositories/` |
| **Sinal de Alerta** | - Novos devs confusos sobre onde adicionar queries<br>- Métodos duplicados em repository e service |
| **Mitigação** | 1. Usar TypeORM Repository diretamente para CRUD simples<br>2. Custom repository apenas para queries complexas |
| **Contingência** | N/A - não causa falhas |
| **Owner** | Backend Lead |
| **Prazo** | Backlog |

---

### RISK-016: Documentação Divergente

| Campo | Valor |
|-------|-------|
| **ID** | RISK-016 |
| **Categoria** | Operacional |
| **Descrição** | Documentação menciona nomes de filas e rotas que diferem do código real. Causa confusão em troubleshooting e onboarding. |
| **Probabilidade** | Alta (3) |
| **Impacto** | Baixo (1) |
| **Score** | 🟢 BAIXO (3) |
| **Arquivos Afetados** | `README.md`, docs/ |
| **Sinal de Alerta** | - Novos devs perguntam sobre discrepâncias<br>- Scripts de deploy usam nomes errados |
| **Mitigação** | 1. Atualizar documentação<br>2. Gerar docs de API automaticamente (Swagger)<br>3. Validar docs no CI |
| **Contingência** | N/A - não causa falhas diretas |
| **Owner** | Tech Writer |
| **Prazo** | Backlog |

---

## Matriz de Riscos Consolidada

| ID | Risco | Prob | Imp | Score | Status |
|----|-------|------|-----|-------|--------|
| RISK-001 | SEFAZ Mock | 3 | 3 | 🔴 9 | Aberto |
| RISK-002 | JWT Secret Exposto | 2 | 3 | 🔴 6 | Aberto |
| RISK-003 | Secrets Placeholder | 3 | 3 | 🔴 9 | Aberto |
| RISK-004 | Health Check Falso | 3 | 3 | 🔴 9 | Aberto |
| RISK-005 | Sem Observabilidade | 3 | 2 | 🟠 6 | Aberto |
| RISK-006 | Sem Validação XSD | 2 | 3 | 🟠 6 | Aberto |
| RISK-007 | CORS Aberto | 2 | 3 | 🟠 6 | Aberto |
| RISK-008 | Decimal Precision | 2 | 3 | 🟠 6 | Aberto |
| RISK-009 | Rate Limit Global | 2 | 2 | 🟠 4 | Aberto |
| RISK-010 | Sem PDB | 2 | 3 | 🟠 6 | Aberto |
| RISK-011 | Retry Duplicado | 3 | 1 | 🟡 3 | Aberto |
| RISK-012 | Stubs Vazios | 1 | 3 | 🟡 3 | Aberto |
| RISK-013 | JWT Guard Manual | 2 | 2 | 🟡 4 | Aberto |
| RISK-014 | Sem TLS | 2 | 3 | 🟠 6 | Aberto |
| RISK-015 | Repos Desnecessários | 3 | 1 | 🟢 3 | Aberto |
| RISK-016 | Docs Divergentes | 3 | 1 | 🟢 3 | Aberto |

---

## Plano de Ação Priorizado

### Imediato (Bloqueia Produção)

1. **RISK-001**: Adicionar flag SEFAZ_MOCK e bloquear prod
2. **RISK-003**: Migrar para External Secrets
3. **RISK-004**: Implementar health checks reais

### 24-48 Horas

4. **RISK-002**: Remover JWT default + validação
5. **RISK-007**: Configurar CORS restritivo
6. **RISK-014**: Configurar TLS

### 1 Semana

7. **RISK-013**: Migrar para passport-jwt
8. **RISK-008**: Implementar Decimal.js
9. **RISK-010**: Adicionar PDB

### 2-4 Semanas

10. **RISK-005**: Implementar observabilidade
11. **RISK-006**: Adicionar validação XSD
12. **RISK-009**: Rate limit por usuário
13. **RISK-011**: Criar BaseConsumer
14. **RISK-012**: Decidir sobre stubs

### Backlog

15. **RISK-015**: Simplificar repositories
16. **RISK-016**: Atualizar documentação
