# 05 - Lista de Tarefas para AI Agents

## Instruções Gerais

Este documento contém tarefas atomizadas para execução por AI coding agents. Cada tarefa é autocontida e pode ser executada independentemente, respeitando as dependências indicadas.

### Formato de Cada Tarefa

```yaml
ID: TASK-XXX
Título: Nome descritivo
Objetivo: O que deve ser alcançado
Contexto: Informações necessárias para entender o problema
Arquivos-Alvo: Lista de arquivos a criar/modificar
Dependências: IDs de tarefas que devem ser concluídas antes
Critério de Aceite: Lista de verificações para considerar completo
Complexidade: S (Small), M (Medium), L (Large)
```

---

## FASE 0: Security Critical

### TASK-001: Remover JWT Secret Default

```yaml
ID: TASK-001
Título: Remover valor default do JWT_SECRET
Objetivo: Eliminar secret hardcoded que representa risco de segurança
Contexto: |
  O arquivo .env.example contém JWT_SECRET=dev-secret-key-change-in-production
  que pode ser acidentalmente usado em produção. A configuração deve falhar
  se JWT_SECRET não for explicitamente definido.
Arquivos-Alvo:
  - .env.example (remover linha JWT_SECRET ou colocar placeholder)
  - src/config/auth.config.ts (remover default value)
  - src/config/env.validation.ts (criar se não existir, adicionar validação)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] .env.example não contém valor real de JWT_SECRET
  - [ ] Aplicação falha ao iniciar se JWT_SECRET não definido
  - [ ] Validação rejeita secrets com palavras: "dev", "secret", "change", "example"
  - [ ] Mensagem de erro clara indica o problema
  - [ ] Testes unitários validam comportamento
Complexidade: S
```

### TASK-002: Implementar JWT Strategy com Passport

```yaml
ID: TASK-002
Título: Migrar JwtAuthGuard para Passport Strategy
Objetivo: Substituir verificação JWT manual por passport-jwt strategy
Contexto: |
  O JwtAuthGuard atual implementa verificação manual de JWT sem validar
  issuer, audience ou algorithm. Passport-jwt já está instalado mas não
  é usado. A nova implementação deve validar todos os claims obrigatórios.
Arquivos-Alvo:
  - src/common/strategies/jwt.strategy.ts (criar)
  - src/common/guards/jwt-auth.guard.ts (simplificar para usar AuthGuard)
  - src/common/services/token-blacklist.service.ts (criar - opcional)
  - src/app.module.ts (registrar strategy)
  - test/common/guards/jwt-auth.guard.spec.ts (atualizar testes)
Dependências: TASK-001
Critério de Aceite:
  - [ ] JwtStrategy criada estendendo PassportStrategy
  - [ ] Validação de issuer configurável via env
  - [ ] Validação de audience configurável via env
  - [ ] Algorithm explicitamente definido como HS256
  - [ ] Payload decodificado populado em request.user
  - [ ] Testes cobrem: token válido, expirado, issuer inválido, audience inválido
  - [ ] JwtAuthGuard reduzido para extends AuthGuard('jwt')
Complexidade: M
```

### TASK-003: Configurar CORS Restritivo

```yaml
ID: TASK-003
Título: Restringir CORS para origens específicas
Objetivo: Limitar CORS para prevenir CSRF de origens não autorizadas
Contexto: |
  O app.enableCors() atual aceita qualquer origem. Em produção, apenas
  origens específicas devem ser permitidas. A configuração deve vir
  de variáveis de ambiente.
Arquivos-Alvo:
  - src/main.ts (configurar CORS com options)
  - src/config/app.config.ts (adicionar CORS_ORIGINS)
  - .env.example (adicionar CORS_ORIGINS)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] CORS_ORIGINS aceita lista separada por vírgula
  - [ ] Em development, aceita localhost:*
  - [ ] Em production, requer CORS_ORIGINS explícito
  - [ ] Requisições de origens não permitidas retornam 403
  - [ ] Preflight (OPTIONS) funciona corretamente
  - [ ] Credentials: true se necessário
Complexidade: S
```

### TASK-004: Criar External Secret Manifest

```yaml
ID: TASK-004
Título: Migrar secrets para External Secrets Operator
Objetivo: Remover secrets hardcoded do repositório
Contexto: |
  k8s/secret.yaml contém valores REPLACE_ME que representam risco.
  External Secrets Operator permite buscar secrets de AWS Secrets Manager,
  Vault, ou similar em runtime.
Arquivos-Alvo:
  - k8s/external-secret.yaml (criar)
  - k8s/secret.yaml (remover ou converter em template)
  - k8s/cluster-secret-store.yaml (criar exemplo)
  - docs/secrets-setup.md (documentar configuração)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] ExternalSecret CRD referencia secret store
  - [ ] Mapeamento para DB_PASSWORD, RABBITMQ_PASSWORD, JWT_SECRET
  - [ ] Refresh interval configurado (1h)
  - [ ] Documentação explica setup do ClusterSecretStore
  - [ ] Arquivo secret.yaml antigo removido ou renomeado
Complexidade: M
```

### TASK-005: Adicionar TLS no Ingress

```yaml
ID: TASK-005
Título: Configurar TLS com cert-manager no Ingress
Objetivo: Habilitar HTTPS para todas as conexões
Contexto: |
  O Ingress atual não configura TLS. Cert-manager pode automatizar
  a obtenção e renovação de certificados Let's Encrypt.
Arquivos-Alvo:
  - k8s/ingress.yaml (adicionar tls config)
  - k8s/cluster-issuer.yaml (criar para cert-manager)
  - docs/tls-setup.md (documentar)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] Ingress tem bloco tls com hosts e secretName
  - [ ] Annotation cert-manager.io/cluster-issuer definido
  - [ ] ClusterIssuer para Let's Encrypt prod criado
  - [ ] Redirect HTTP para HTTPS configurado
  - [ ] Documentação inclui pré-requisitos (cert-manager instalado)
Complexidade: S
```

### TASK-006: Implementar Validação de Env Vars

```yaml
ID: TASK-006
Título: Validação rigorosa de variáveis de ambiente no startup
Objetivo: Fail fast se configuração inválida
Contexto: |
  A aplicação deve falhar imediatamente ao iniciar se variáveis de ambiente
  obrigatórias estão ausentes ou com valores inválidos. Usar Joi para
  validação declarativa.
Arquivos-Alvo:
  - src/config/env.validation.ts (criar)
  - src/app.module.ts (integrar validação no ConfigModule)
Dependências: TASK-001
Critério de Aceite:
  - [ ] Joi schema valida todas as variáveis críticas
  - [ ] DB_PASSWORD requer mínimo 16 caracteres em production
  - [ ] JWT_SECRET requer mínimo 32 caracteres
  - [ ] URLs validadas como URI (S3_ENDPOINT, etc)
  - [ ] Números com ranges (DB_POOL_SIZE: 5-50)
  - [ ] Mensagens de erro claras para cada violação
  - [ ] App não inicia se validação falhar
Complexidade: M
```

---

## FASE 1: Foundation

### TASK-101: Criar HealthService com Checks Reais

```yaml
ID: TASK-101
Título: Implementar verificações de saúde das dependências
Objetivo: Health check que verifica conexões reais com DB, Redis, RabbitMQ
Contexto: |
  O HealthController atual retorna sempre { status: 'ok' } sem verificar
  nada. Isso causa pods "healthy" com conexões quebradas. O HealthService
  deve verificar todas as dependências críticas.
Arquivos-Alvo:
  - src/infrastructure/health/health.service.ts (criar)
  - src/infrastructure/health/health.module.ts (criar)
  - src/infrastructure/health/interfaces/health-indicator.interface.ts (criar)
  - src/infrastructure/health/indicators/ (criar indicadores específicos)
  - test/infrastructure/health/health.service.spec.ts (criar)
Dependências: Nenhuma (pode rodar em paralelo com FASE 0)
Critério de Aceite:
  - [ ] checkDatabase() executa SELECT 1 no PostgreSQL
  - [ ] checkRedis() executa PING no Redis
  - [ ] checkRabbitMQ() verifica conexão ativa
  - [ ] checkS3() (opcional) verifica acesso ao bucket
  - [ ] Cada check tem timeout configurável (default 5s)
  - [ ] Resultado agrega status de todos os checks
  - [ ] healthy = true apenas se TODOS os checks passarem
  - [ ] Testes mockam dependências e testam cenários de falha
Complexidade: M
```

### TASK-102: Refatorar HealthController

```yaml
ID: TASK-102
Título: Integrar HealthService no HealthController
Objetivo: Endpoints /health/live e /health/ready com semântica correta
Contexto: |
  Kubernetes usa liveness para reiniciar pods travados e readiness para
  rotear tráfego. Liveness deve ser simples (processo vivo), readiness
  deve verificar dependências.
Arquivos-Alvo:
  - src/modules/api-gateway/controllers/health.controller.ts (refatorar)
  - src/modules/api-gateway/api-gateway.module.ts (importar HealthModule)
  - test/modules/api-gateway/health.controller.spec.ts (atualizar)
Dependências: TASK-101
Critério de Aceite:
  - [ ] GET /health/live retorna 200 se processo está vivo
  - [ ] GET /health/ready usa HealthService.checkReadiness()
  - [ ] GET /health/ready retorna 503 com detalhes se algum check falhar
  - [ ] Response body inclui status de cada dependência
  - [ ] Endpoints não requerem autenticação
  - [ ] Testes cobrem cenários de sucesso e falha
Complexidade: S
```

### TASK-105: Criar PodDisruptionBudget

```yaml
ID: TASK-105
Título: Adicionar PDB para garantir disponibilidade em manutenções
Objetivo: Mínimo de pods disponíveis durante drain/rollouts
Contexto: |
  Sem PDB, kubectl drain pode derrubar todos os pods. Com minAvailable: 2,
  garantimos que sempre há capacidade de processamento.
Arquivos-Alvo:
  - k8s/pdb.yaml (criar)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] PDB criado com minAvailable: 2
  - [ ] Selector matches labels do Deployment
  - [ ] Namespace correto (finance)
Complexidade: S
```

### TASK-106: Implementar Structured Logging

```yaml
ID: TASK-106
Título: Padronizar logs em formato JSON estruturado
Objetivo: Logs parseáveis por Loki/ELK com campos consistentes
Contexto: |
  Logs atuais são texto livre, dificultando busca e análise. Logs JSON
  com campos padronizados (timestamp, level, message, correlationId)
  são essenciais para troubleshooting.
Arquivos-Alvo:
  - src/infrastructure/observability/logger.service.ts (criar ou refatorar)
  - src/infrastructure/observability/logger.interceptor.ts (criar)
  - src/common/interceptors/logging.interceptor.ts (refatorar)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] Todos os logs são JSON válido
  - [ ] Campos obrigatórios: timestamp, level, message, service
  - [ ] Campos opcionais: correlationId, userId, duration, error
  - [ ] Níveis: debug, info, warn, error
  - [ ] Error logs incluem stack trace
  - [ ] Não logar dados sensíveis (passwords, tokens)
Complexidade: M
```

### TASK-107: Adicionar Correlation ID em Todas as Camadas

```yaml
ID: TASK-107
Título: Propagar correlationId do request até os consumers
Objetivo: Rastrear requisições através de todo o pipeline
Contexto: |
  CorrelationId permite correlacionar logs de diferentes serviços/stages
  para uma mesma requisição. Deve ser gerado na entrada (ou extraído de
  header) e propagado via RabbitMQ message properties.
Arquivos-Alvo:
  - src/common/middleware/correlation-id.middleware.ts (criar)
  - src/common/context/async-local-storage.ts (criar)
  - src/infrastructure/rabbitmq/rabbitmq.service.ts (adicionar em properties)
  - Todos os consumers (extrair de msg.properties.correlationId)
  - src/app.module.ts (registrar middleware)
Dependências: TASK-106
Critério de Aceite:
  - [ ] Middleware extrai X-Correlation-ID do header ou gera UUID
  - [ ] AsyncLocalStorage disponibiliza correlationId em qualquer ponto
  - [ ] Logger automaticamente inclui correlationId
  - [ ] Mensagens RabbitMQ incluem correlationId em properties
  - [ ] Consumers extraem e propagam correlationId
  - [ ] Response header inclui X-Correlation-ID
Complexidade: M
```

---

## FASE 2: Code Quality

### TASK-201: Criar BaseConsumer Abstrato

```yaml
ID: TASK-201
Título: Implementar classe base para todos os RabbitMQ consumers
Objetivo: Eliminar duplicação de lógica de retry, DLQ, error handling
Contexto: |
  XmlProcessorConsumer, BusinessValidatorConsumer e PersistenceConsumer
  têm ~80 linhas idênticas cada para retry/DLQ. BaseConsumer abstrato
  centraliza essa lógica.
Arquivos-Alvo:
  - src/infrastructure/rabbitmq/interfaces/consumer.interface.ts (criar)
  - src/infrastructure/rabbitmq/decorators/consumer.decorator.ts (criar - opcional)
Dependências: TASK-106, TASK-107
Critério de Aceite:
  - [ ] BaseConsumer<T> é classe abstrata genérica
  - [ ] Métodos abstratos: process(data: T), isRetryable(error), queueName, dlqName
  - [ ] handleMessage() implementa lógica completa de consumo
  - [ ] Retry com exponential backoff configurável
  - [ ] maxRetries configurável (default 3)
  - [ ] Envia para DLQ após esgotar retries
  - [ ] Logging e métricas integrados
  - [ ] Testes cobrem: sucesso, retry, DLQ, erro não-retryável
Complexidade: L
```

### TASK-202: Migrar XmlProcessorConsumer para BaseConsumer

```yaml
ID: TASK-202
Título: Refatorar XmlProcessorConsumer para estender BaseConsumer
Objetivo: Aplicar padrão BaseConsumer no primeiro consumer
Contexto: |
  XmlProcessorConsumer deve se tornar uma classe simples que implementa
  apenas process() e isRetryable(), delegando o resto para BaseConsumer.
Arquivos-Alvo:
  - src/modules/xml-processor/consumers/xml-processor.consumer.ts (refatorar)
  - test/modules/xml-processor/consumers/xml-processor.consumer.spec.ts (atualizar)
Dependências: TASK-201
Critério de Aceite:
  - [ ] Classe estende BaseConsumer<NfReceivedEvent>
  - [ ] Implementa apenas process() e isRetryable()
  - [ ] queueName = QUEUES.NF_RECEIVED
  - [ ] dlqName = QUEUES.NF_RECEIVED_DLQ
  - [ ] Código reduzido de ~100 linhas para ~30 linhas
  - [ ] Testes existentes continuam passando
  - [ ] Novos testes para integração com BaseConsumer
Complexidade: M
```

### TASK-203: Migrar BusinessValidatorConsumer

```yaml
ID: TASK-203
Título: Refatorar BusinessValidatorConsumer para estender BaseConsumer
Objetivo: Aplicar padrão BaseConsumer no segundo consumer
Arquivos-Alvo:
  - src/modules/business-validator/consumers/business-validator.consumer.ts
  - test/modules/business-validator/consumers/business-validator.consumer.spec.ts
Dependências: TASK-201
Critério de Aceite:
  - [ ] Classe estende BaseConsumer<NfParsedEvent>
  - [ ] Implementa apenas process() e isRetryable()
  - [ ] Código reduzido significativamente
  - [ ] Testes passando
Complexidade: M
```

### TASK-204: Migrar PersistenceConsumer

```yaml
ID: TASK-204
Título: Refatorar PersistenceConsumer para estender BaseConsumer
Objetivo: Aplicar padrão BaseConsumer no terceiro consumer
Arquivos-Alvo:
  - src/modules/persistence/consumers/persistence.consumer.ts
  - test/modules/persistence/consumers/persistence.consumer.spec.ts
Dependências: TASK-201
Critério de Aceite:
  - [ ] Classe estende BaseConsumer<NfValidatedEvent>
  - [ ] Implementa apenas process() e isRetryable()
  - [ ] Código reduzido significativamente
  - [ ] Testes passando
Complexidade: M
```

### TASK-205: Criar CircuitBreakerFactory

```yaml
ID: TASK-205
Título: Factory para criar circuit breakers com configuração padrão
Objetivo: Padronizar uso de opossum em todos os HTTP clients
Contexto: |
  ReceitaWsClient usa opossum corretamente, mas SefazClient tem circuit
  breaker manual incompleto. Factory garante configuração consistente.
Arquivos-Alvo:
  - src/infrastructure/http/circuit-breaker.factory.ts (criar)
  - src/infrastructure/http/circuit-breaker.config.ts (criar)
  - src/infrastructure/http/http.module.ts (criar ou atualizar)
  - test/infrastructure/http/circuit-breaker.factory.spec.ts (criar)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] Factory injetável via DI
  - [ ] create<T>(fn, options) retorna CircuitBreaker<T>
  - [ ] Defaults: timeout 5s, errorThreshold 50%, resetTimeout 30s
  - [ ] Options podem sobrescrever defaults
  - [ ] Eventos (open, close, halfOpen) logados
  - [ ] Métricas de circuit breaker expostas
Complexidade: M
```

### TASK-206: Padronizar HTTP Clients com CircuitBreakerFactory

```yaml
ID: TASK-206
Título: Refatorar todos os HTTP clients para usar CircuitBreakerFactory
Objetivo: Comportamento consistente de resiliência em todas as integrações
Arquivos-Alvo:
  - src/modules/business-validator/clients/sefaz.client.ts (refatorar)
  - src/modules/business-validator/clients/receita-ws.client.ts (refatorar)
  - test/modules/business-validator/clients/*.spec.ts (atualizar)
Dependências: TASK-205
Critério de Aceite:
  - [ ] SefazClient usa CircuitBreakerFactory
  - [ ] ReceitaWsClient migrado para usar factory
  - [ ] Circuit breaker manual removido do SefazClient
  - [ ] Testes cobrem estados: closed, open, half-open
  - [ ] Métricas de cada client distintas via labels
Complexidade: M
```

### TASK-207: Implementar Decimal.js para Valores Monetários

```yaml
ID: TASK-207
Título: Substituir number por Decimal em campos monetários
Objetivo: Eliminar perda de precisão em valores financeiros
Contexto: |
  JavaScript float (number) perde precisão: 0.1 + 0.2 !== 0.3
  Valores de NF-e devem usar Decimal.js para precisão arbitrária.
Arquivos-Alvo:
  - package.json (adicionar decimal.js)
  - src/common/transformers/decimal.transformer.ts (criar)
  - src/modules/persistence/entities/nf-document.entity.ts (atualizar)
  - src/modules/persistence/entities/nf-item.entity.ts (atualizar)
  - src/modules/*/dtos/*.dto.ts (atualizar campos monetários)
  - test/** (atualizar testes afetados)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] decimal.js instalado
  - [ ] Transformer converte string DB <-> Decimal
  - [ ] Entities usam Decimal para: totalValue, unitPrice, quantity, etc
  - [ ] DTOs serializam Decimal como string no JSON
  - [ ] Operações matemáticas usam métodos Decimal (plus, minus, times)
  - [ ] Teste demonstra precisão: Decimal('0.1').plus('0.2').equals('0.3')
Complexidade: M
```

### TASK-208: Criar Hierarquia de Exceptions

```yaml
ID: TASK-208
Título: Padronizar exceptions com hierarquia clara
Objetivo: Exceptions consistentes com códigos, HTTP status, e retryability
Arquivos-Alvo:
  - src/common/exceptions/base.exception.ts (criar)
  - src/common/exceptions/retryable.exception.ts (criar)
  - src/common/exceptions/non-retryable.exception.ts (criar)
  - src/common/exceptions/domain/*.exception.ts (criar específicas)
  - src/common/exceptions/infrastructure/*.exception.ts (criar específicas)
  - src/common/exceptions/index.ts (barrel export)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] BaseException abstrata com: httpStatusCode, errorCode, isRetryable, context
  - [ ] RetryableException com isRetryable = true
  - [ ] NonRetryableException com isRetryable = false
  - [ ] Domain: NfNotFoundException, XmlValidationException, BusinessRuleException
  - [ ] Infra: DatabaseException, RedisException, RabbitMqException, ExternalServiceException
  - [ ] toJSON() serializa para response API
  - [ ] Documentação inline com exemplos de uso
Complexidade: M
```

### TASK-209: Refatorar GlobalExceptionFilter

```yaml
ID: TASK-209
Título: Atualizar filter para usar nova hierarquia de exceptions
Objetivo: Responses de erro consistentes e informativos
Arquivos-Alvo:
  - src/common/filters/global-exception.filter.ts (refatorar)
  - test/common/filters/global-exception.filter.spec.ts (atualizar)
Dependências: TASK-208
Critério de Aceite:
  - [ ] Reconhece exceptions da hierarquia customizada
  - [ ] HTTP status vem de exception.httpStatusCode
  - [ ] Response body inclui: error, message, correlationId, timestamp
  - [ ] Não expõe stack trace em production
  - [ ] Loga exception com nível apropriado (warn para 4xx, error para 5xx)
  - [ ] Métricas de erro incrementadas
Complexidade: M
```

### TASK-210: Eliminar Any Types

```yaml
ID: TASK-210
Título: Remover todos os usos de 'any' no código
Objetivo: Type safety completo em todo o codebase
Arquivos-Alvo:
  - Todos os arquivos .ts
  - tsconfig.json (garantir noImplicitAny: true)
  - .eslintrc.js (adicionar @typescript-eslint/no-explicit-any: error)
Dependências: TASK-207, TASK-208
Critério de Aceite:
  - [ ] Zero ocorrências de 'any' explícito
  - [ ] Zero ocorrências de 'any' implícito
  - [ ] ESLint rule no-explicit-any habilitada
  - [ ] Tipos criados para todas as estruturas de dados
  - [ ] Interfaces para respostas de APIs externas
  - [ ] Generics usados onde apropriado
Complexidade: L
```

### TASK-211: Criar Validadores Customizados

```yaml
ID: TASK-211
Título: Implementar decorators de validação reutilizáveis
Objetivo: Eliminar duplicação de validações em DTOs
Arquivos-Alvo:
  - src/common/validators/is-chave-acesso.validator.ts (criar)
  - src/common/validators/is-cnpj.validator.ts (criar)
  - src/common/validators/is-cpf.validator.ts (criar)
  - src/common/validators/is-ie.validator.ts (criar - Inscrição Estadual)
  - src/common/validators/index.ts (barrel export)
  - test/common/validators/*.spec.ts (criar)
Dependências: Nenhuma
Critério de Aceite:
  - [ ] @IsChaveAcesso() valida 44 dígitos + dígito verificador
  - [ ] @IsCnpj() valida 14 dígitos + dígito verificador
  - [ ] @IsCpf() valida 11 dígitos + dígito verificador
  - [ ] @IsIe(uf) valida Inscrição Estadual por UF
  - [ ] Mensagens de erro claras e em português
  - [ ] Testes cobrem: valores válidos, inválidos, edge cases
Complexidade: M
```

---

## FASE 3: Features

### TASK-301: Implementar Validação XSD

```yaml
ID: TASK-301
Título: Validar XML contra schema XSD da NF-e 4.0
Objetivo: Rejeitar XMLs malformados antes do processamento
Contexto: |
  XMLs inválidos passam pelo pipeline e causam erros downstream.
  Validação XSD garante estrutura correta antes do parse.
Arquivos-Alvo:
  - src/schemas/nfe_v4.00.xsd (adicionar)
  - schemas/tipos_basicos_v4.00.xsd (adicionar)
  - src/modules/xml-processor/validators/xsd.validator.ts (criar)
  - src/modules/xml-processor/xml-processor.service.ts (integrar)
  - test/modules/xml-processor/validators/xsd.validator.spec.ts (criar)
Dependências: TASK-208
Critério de Aceite:
  - [ ] Schemas XSD oficiais da SEFAZ adicionados
  - [ ] XsdValidator.validate(xml) retorna ValidationResult
  - [ ] Erros incluem linha, coluna e mensagem
  - [ ] XmlProcessorService valida antes de parsear
  - [ ] XmlValidationException lançada com detalhes
  - [ ] Testes com XMLs válidos e inválidos
Complexidade: L
```

### TASK-302: Implementar Rate Limiting por Usuário

```yaml
ID: TASK-302
Título: Limitar requisições por usuário além do limite global
Objetivo: Prevenir abuso por usuários individuais
Contexto: |
  Rate limit atual é global. Um usuário pode consumir toda a cota.
  Limit por usuário (baseado em JWT sub) é necessário.
Arquivos-Alvo:
  - src/common/guards/rate-limit.guard.ts (criar ou refatorar)
  - src/infrastructure/redis/rate-limiter.service.ts (criar)
  - src/config/throttle.config.ts (adicionar per-user config)
  - .env.example (adicionar THROTTLE_LIMIT_PER_USER)
Dependências: TASK-002
Critério de Aceite:
  - [ ] Rate limit global mantido (THROTTLE_LIMIT)
  - [ ] Rate limit por usuário adicionado (THROTTLE_LIMIT_PER_USER)
  - [ ] Implementado com Redis (sliding window)
  - [ ] Response header X-RateLimit-Remaining
  - [ ] Response header X-RateLimit-Reset
  - [ ] 429 Too Many Requests com Retry-After
Complexidade: M
```

### TASK-303: Criar Camada de Use Cases

```yaml
ID: TASK-303
Título: Introduzir Application Layer com Use Cases
Objetivo: Separar lógica de aplicação dos controllers e services
Contexto: |
  Controllers acessam services diretamente, acoplando presentation
  à implementação. Use Cases encapsulam operações de negócio.
Arquivos-Alvo:
  - src/application/use-cases/receive-nf.use-case.ts (criar)
  - src/application/use-cases/get-nf-by-id.use-case.ts (criar)
  - src/application/use-cases/reprocess-nf.use-case.ts (criar)
  - src/application/interfaces/repositories/*.interface.ts (criar)
  - src/modules/api-gateway/controllers/*.controller.ts (refatorar)
Dependências: TASK-208
Critério de Aceite:
  - [ ] Use Cases são classes @Injectable()
  - [ ] Cada Use Case tem método execute() com DTO de entrada
  - [ ] Controllers delegam para Use Cases
  - [ ] Use Cases usam interfaces de repository (não implementações)
  - [ ] Lógica de negócio movida de controllers para use cases
  - [ ] Testes de use cases sem mock de HTTP
Complexidade: L
```

---

## Índice de Tarefas

| ID | Título | Fase | Complexidade | Dependências |
|----|--------|------|--------------|--------------|
| TASK-001 | Remover JWT Secret Default | 0 | S | - |
| TASK-002 | Implementar JWT Strategy | 0 | M | TASK-001 |
| TASK-003 | Configurar CORS Restritivo | 0 | S | - |
| TASK-004 | Criar External Secret Manifest | 0 | M | - |
| TASK-005 | Adicionar TLS no Ingress | 0 | S | - |
| TASK-006 | Implementar Validação de Env Vars | 0 | M | TASK-001 |
| TASK-101 | Criar HealthService | 1 | M | - |
| TASK-102 | Refatorar HealthController | 1 | S | TASK-101 |
| TASK-105 | Criar PodDisruptionBudget | 1 | S | - |
| TASK-106 | Implementar Structured Logging | 1 | M | - |
| TASK-107 | Adicionar Correlation ID | 1 | M | TASK-106 |
| TASK-201 | Criar BaseConsumer | 2 | L | TASK-106, TASK-107 |
| TASK-202 | Migrar XmlProcessorConsumer | 2 | M | TASK-201 |
| TASK-203 | Migrar BusinessValidatorConsumer | 2 | M | TASK-201 |
| TASK-204 | Migrar PersistenceConsumer | 2 | M | TASK-201 |
| TASK-205 | Criar CircuitBreakerFactory | 2 | M | - |
| TASK-206 | Padronizar HTTP Clients | 2 | M | TASK-205 |
| TASK-207 | Implementar Decimal.js | 2 | M | - |
| TASK-208 | Criar Hierarquia de Exceptions | 2 | M | - |
| TASK-209 | Refatorar GlobalExceptionFilter | 2 | M | TASK-208 |
| TASK-210 | Eliminar Any Types | 2 | L | TASK-207, TASK-208 |
| TASK-211 | Criar Validadores Customizados | 2 | M | - |
| TASK-301 | Implementar Validação XSD | 3 | L | TASK-208 |
| TASK-302 | Rate Limiting por Usuário | 3 | M | TASK-002 |
| TASK-303 | Criar Camada de Use Cases | 3 | L | TASK-208 |
