# 06 - Regras de Desenvolvimento

## Propósito

Este documento define as regras obrigatórias para desenvolvimento no finance-consumer. Todas as contribuições devem seguir estas diretrizes para manter consistência, qualidade e segurança.

---

## Regras de Arquitetura

### A01: Separação de Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  src/modules/api-gateway/controllers/                        │
│  • Apenas validação de input (class-validator)               │
│  • Transformação request → DTO                               │
│  • Delegação para Use Cases                                  │
│  • Não contém lógica de negócio                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  src/application/use-cases/                                  │
│  • Orquestração de operações                                 │
│  • Validação de regras de negócio                           │
│  • Usa interfaces (não implementações)                       │
│  • Transações quando necessário                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                            │
│  src/domain/                                                 │
│  • Entities sem dependências de infraestrutura              │
│  • Value Objects imutáveis                                   │
│  • Domain Services para lógica cross-entity                 │
│  • Interfaces de Repository                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER                        │
│  src/infrastructure/                                         │
│  • Implementações de Repository                             │
│  • Clientes HTTP, RabbitMQ, Redis                           │
│  • TypeORM entities (separadas de domain entities)          │
│  • Mappers entre domain e infra                             │
└─────────────────────────────────────────────────────────────┘
```

**Regras**:
- ❌ Controllers NÃO podem acessar Repositories diretamente
- ❌ Domain NÃO pode importar de Infrastructure
- ❌ Use Cases NÃO podem importar implementações concretas
- ✅ Usar injeção de dependência com interfaces

### A02: Direção de Dependências

```
Presentation → Application → Domain ← Infrastructure
                    ↓              ↑
              (usa interfaces) (implementa interfaces)
```

**Regra**: Dependências sempre apontam para o centro (Domain). Infrastructure implementa interfaces definidas em Domain.

### A03: Módulos Coesos

Cada módulo deve ter responsabilidade única:

| Módulo | Responsabilidade | Não deve conter |
|--------|------------------|-----------------|
| api-gateway | HTTP handling | Lógica de negócio |
| nf-receiver | Recepção e idempotência | Parsing XML |
| xml-processor | Parse e extração | Validação de negócio |
| business-validator | Regras de negócio | Persistência |
| persistence | Armazenamento | Lógica de processamento |

### A04: Comunicação entre Módulos

- Módulos se comunicam via RabbitMQ (eventos)
- Não há chamadas síncronas entre módulos de processamento
- Cada módulo pode ter sua própria instância de Redis/DB se necessário

---

## Regras de Código

### C01: TypeScript Strict Mode

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

**Regra**: Zero tolerância para `any`. Use tipos específicos ou `unknown` com type guards.

### C02: Naming Conventions

| Tipo | Convenção | Exemplo |
|------|-----------|---------|
| Classes | PascalCase | `NfReceiverService` |
| Interfaces | PascalCase com I prefix | `INfRepository` |
| Types | PascalCase | `NfStatus` |
| Métodos | camelCase | `processNf()` |
| Variáveis | camelCase | `nfDocument` |
| Constantes | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Arquivos | kebab-case | `nf-receiver.service.ts` |
| Enums | PascalCase (enum e valores) | `NfStatus.PROCESSING` |

### C03: Estrutura de Arquivos

```
src/modules/{module-name}/
├── {module-name}.module.ts      # NestJS module
├── consumers/                    # RabbitMQ consumers
│   └── {name}.consumer.ts
├── controllers/                  # HTTP controllers (se houver)
│   └── {name}.controller.ts
├── services/                     # Business logic
│   └── {name}.service.ts
├── dtos/                        # Data Transfer Objects
│   ├── {name}.request.dto.ts
│   └── {name}.response.dto.ts
├── entities/                    # TypeORM entities (se local)
│   └── {name}.entity.ts
├── interfaces/                  # Interfaces locais
│   └── {name}.interface.ts
└── __tests__/                   # Testes do módulo
    ├── {name}.service.spec.ts
    └── {name}.consumer.spec.ts
```

### C04: Tamanho de Funções

- Máximo **50 linhas** por função
- Máximo **200 linhas** por arquivo
- Se exceder, extrair para funções/classes auxiliares

```typescript
// ❌ Ruim - função muito longa
async processNf(data: NfData): Promise<void> {
  // 100+ linhas de código
}

// ✅ Bom - funções pequenas e focadas
async processNf(data: NfData): Promise<void> {
  const validated = await this.validateInput(data);
  const parsed = await this.parseXml(validated.xml);
  const enriched = await this.enrichData(parsed);
  await this.persist(enriched);
}

private async validateInput(data: NfData): Promise<ValidatedNfData> { /* 10 linhas */ }
private async parseXml(xml: string): Promise<ParsedNf> { /* 15 linhas */ }
private async enrichData(parsed: ParsedNf): Promise<EnrichedNf> { /* 20 linhas */ }
private async persist(enriched: EnrichedNf): Promise<void> { /* 10 linhas */ }
```

### C05: Error Handling

```typescript
// ❌ Ruim - catch genérico
try {
  await this.process(data);
} catch (error) {
  console.log(error);
  throw error;
}

// ❌ Ruim - swallow error
try {
  await this.process(data);
} catch (error) {
  // silently ignore
}

// ✅ Bom - tratamento específico
try {
  await this.process(data);
} catch (error) {
  if (error instanceof XmlValidationException) {
    this.logger.warn('XML validation failed', { error, correlationId });
    throw error; // Non-retryable, propagar
  }
  
  if (error instanceof ExternalServiceException) {
    this.logger.error('External service failed', { error, correlationId });
    throw new RetryableProcessingException(error.message, { cause: error });
  }
  
  // Erro inesperado
  this.logger.error('Unexpected error', { error, correlationId });
  throw new InternalServerException('Processing failed', { cause: error });
}
```

### C06: Async/Await

- Sempre usar async/await em vez de .then().catch()
- Nunca usar callbacks para operações assíncronas
- Promise.all para operações paralelas independentes

```typescript
// ❌ Ruim
fetchData()
  .then(data => process(data))
  .then(result => save(result))
  .catch(err => handleError(err));

// ✅ Bom
try {
  const data = await fetchData();
  const result = await process(data);
  await save(result);
} catch (error) {
  handleError(error);
}

// ✅ Paralelo
const [users, products] = await Promise.all([
  fetchUsers(),
  fetchProducts(),
]);
```

### C07: Null Safety

```typescript
// ❌ Ruim - non-null assertion
const user = request.user!;

// ❌ Ruim - sem verificação
function process(data: Data | null) {
  return data.value; // Pode ser null!
}

// ✅ Bom - verificação explícita
const user = request.user;
if (!user) {
  throw new UnauthorizedException('User not found');
}

// ✅ Bom - optional chaining com fallback
const name = user?.profile?.name ?? 'Unknown';

// ✅ Bom - type guard
function isNfDocument(value: unknown): value is NfDocument {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'chaveAcesso' in value
  );
}
```

---

## Regras de Importação

### I01: Ordem de Imports

```typescript
// 1. Node.js built-ins
import { readFileSync } from 'fs';
import { join } from 'path';

// 2. External packages (npm)
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as xml2js from 'xml2js';

// 3. Internal - infrastructure (@infrastructure/)
import { RabbitMqService } from '@infrastructure/rabbitmq/rabbitmq.service';
import { RedisService } from '@infrastructure/redis/redis.service';

// 4. Internal - common (@common/)
import { QUEUES } from '@common/constants/queues';
import { BaseException } from '@common/exceptions/base.exception';

// 5. Internal - application (@application/)
import { ReceiveNfUseCase } from '@application/use-cases/receive-nf.use-case';

// 6. Internal - same module (relative)
import { NfDocument } from './entities/nf-document.entity';
import { NfMapper } from './mappers/nf.mapper';
```

### I02: Path Aliases

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@common/*": ["src/common/*"],
      "@config/*": ["src/config/*"],
      "@infrastructure/*": ["src/infrastructure/*"],
      "@application/*": ["src/application/*"],
      "@domain/*": ["src/domain/*"],
      "@modules/*": ["src/modules/*"]
    }
  }
}
```

**Regra**: Sempre usar path aliases para imports cross-module. Relative imports apenas dentro do mesmo módulo.

### I03: Barrel Exports

```typescript
// src/common/exceptions/index.ts
export * from './base.exception';
export * from './retryable.exception';
export * from './non-retryable.exception';
export * from './domain/nf-not-found.exception';
export * from './domain/xml-validation.exception';
// ...

// Uso
import { 
  NfNotFoundException, 
  XmlValidationException 
} from '@common/exceptions';
```

### I04: Proibições de Import

```typescript
// ❌ PROIBIDO: Import de implementação em domain
// src/domain/services/nf.domain-service.ts
import { TypeOrmNfRepository } from '@infrastructure/persistence/repositories';

// ✅ CORRETO: Import de interface
import { INfRepository } from '@domain/interfaces/nf-repository.interface';

// ❌ PROIBIDO: Import circular
// src/modules/a/a.service.ts
import { BService } from '@modules/b/b.service';
// src/modules/b/b.service.ts
import { AService } from '@modules/a/a.service';

// ✅ CORRETO: Usar eventos ou interface compartilhada
```

---

## Regras de Testes

### T01: Estrutura de Testes

```typescript
describe('NfReceiverService', () => {
  // Arrange - setup compartilhado
  let service: NfReceiverService;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockRabbitMqService: jest.Mocked<RabbitMqService>;

  beforeEach(async () => {
    // Setup de mocks e injeção
  });

  describe('receiveNf', () => {
    describe('quando NF é nova', () => {
      it('deve salvar chave no Redis', async () => {
        // Arrange
        const input = createValidNfInput();
        
        // Act
        await service.receiveNf(input);
        
        // Assert
        expect(mockRedisService.set).toHaveBeenCalledWith(
          expect.stringContaining(input.chaveAcesso),
          expect.any(String),
          expect.any(Number),
        );
      });

      it('deve publicar evento no RabbitMQ', async () => {
        // ...
      });
    });

    describe('quando NF já existe', () => {
      it('deve lançar DuplicateNfException', async () => {
        // ...
      });
    });

    describe('quando Redis está indisponível', () => {
      it('deve lançar RetryableException', async () => {
        // ...
      });
    });
  });
});
```

### T02: Naming de Testes

```typescript
// ❌ Ruim - vago
it('should work', () => {});
it('test process', () => {});

// ✅ Bom - descreve comportamento
it('deve retornar 404 quando NF não existe', () => {});
it('deve enviar para DLQ após 3 tentativas falhas', () => {});
it('deve validar CNPJ com dígito verificador correto', () => {});
```

### T03: Cobertura Mínima

| Tipo | Cobertura Mínima |
|------|------------------|
| Unit Tests | 85% |
| Services | 90% |
| Use Cases | 95% |
| Validators | 100% |
| Controllers | 70% (cobertos por E2E) |

### T04: Mocking

```typescript
// ❌ Ruim - mock excessivo
jest.mock('@nestjs/common');
jest.mock('@nestjs/typeorm');
jest.mock('typeorm');

// ✅ Bom - mock apenas dependências diretas
const mockRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
};

const module = await Test.createTestingModule({
  providers: [
    NfService,
    {
      provide: getRepositoryToken(NfDocument),
      useValue: mockRepository,
    },
  ],
}).compile();
```

### T05: Testes de Integração

- Usar testcontainers para PostgreSQL, Redis, RabbitMQ
- Não mockar infraestrutura em testes de integração
- Limpar estado entre testes

```typescript
// test/integration/persistence.integration.spec.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';

describe('PersistenceService (Integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();
    dataSource = await createTestDataSource(container.getConnectionUri());
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE nf_documents CASCADE');
  });

  it('deve persistir NF-e completa com items', async () => {
    // Teste real contra PostgreSQL
  });
});
```

---

## Regras de Pull Request

### PR01: Branch Naming

```
feature/TASK-XXX-descricao-curta
fix/TASK-XXX-descricao-curta
refactor/TASK-XXX-descricao-curta
docs/TASK-XXX-descricao-curta
chore/TASK-XXX-descricao-curta
```

### PR02: Commit Messages

```
type(scope): descrição curta

[corpo opcional com mais detalhes]

[footer com referências]
```

**Tipos**:
- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `refactor`: Refatoração sem mudar comportamento
- `test`: Adição ou correção de testes
- `docs`: Documentação
- `chore`: Tarefas de manutenção
- `perf`: Melhorias de performance

**Exemplos**:
```
feat(auth): implementar JWT Strategy com passport

- Adiciona JwtStrategy estendendo PassportStrategy
- Valida issuer, audience e algorithm
- Integra com token blacklist

Refs: TASK-002

fix(xml): corrigir parse de XMLs com namespace

O parser não estava considerando namespaces customizados
em algumas NF-e de fornecedores específicos.

Fixes: #123
```

### PR03: Checklist de PR

```markdown
## Checklist

### Código
- [ ] Segue convenções de naming
- [ ] Sem `any` types
- [ ] Funções < 50 linhas
- [ ] Error handling adequado
- [ ] Logs estruturados adicionados

### Testes
- [ ] Testes unitários adicionados/atualizados
- [ ] Cobertura > 85%
- [ ] Testes passando localmente
- [ ] Testes de integração (se aplicável)

### Documentação
- [ ] JSDoc em interfaces públicas
- [ ] README atualizado (se necessário)
- [ ] Swagger/OpenAPI atualizado (se API)

### Segurança
- [ ] Sem secrets hardcoded
- [ ] Sem dados sensíveis em logs
- [ ] Validação de input

### Review
- [ ] Self-review realizado
- [ ] Code review solicitado
```

### PR04: Requisitos para Merge

- ✅ CI pipeline passando (lint, test, build)
- ✅ Pelo menos 1 approval de code review
- ✅ Sem conflitos com main
- ✅ Coverage não diminuiu
- ✅ Checklist completo

---

## Regras de Segurança

### S01: Secrets

- ❌ Nunca commitar secrets, tokens, passwords
- ✅ Usar variáveis de ambiente
- ✅ Usar External Secrets Operator em K8s
- ✅ .env.example com placeholders, não valores reais

### S02: Logging

```typescript
// ❌ NUNCA logar
this.logger.log(`User authenticated with password: ${password}`);
this.logger.log(`Token: ${jwt}`);
this.logger.log(`Credit card: ${cardNumber}`);

// ✅ Logar com sanitização
this.logger.log(`User authenticated: ${userId}`);
this.logger.log(`Processing NF: ${chaveAcesso}`);
this.logger.log(`Request from IP: ${this.maskIp(ip)}`);
```

### S03: Input Validation

- Todo input de usuário deve ser validado
- Usar class-validator em DTOs
- Validar tamanho máximo de payloads
- Sanitizar dados antes de persistir

### S04: SQL Injection

```typescript
// ❌ Vulnerável
const query = `SELECT * FROM users WHERE id = '${userId}'`;

// ✅ Seguro - parametrizado
const user = await this.repository.findOne({ where: { id: userId } });

// ✅ Seguro - query builder com parâmetros
const result = await this.repository
  .createQueryBuilder('nf')
  .where('nf.chaveAcesso = :chave', { chave: chaveAcesso })
  .getOne();
```

---

## ESLint Rules Obrigatórias

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    // TypeScript
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    
    // Code quality
    'no-console': 'error',
    'no-debugger': 'error',
    'no-magic-numbers': ['error', { ignore: [0, 1, -1] }],
    'max-lines-per-function': ['error', { max: 50 }],
    'max-lines': ['error', { max: 200 }],
    'complexity': ['error', { max: 10 }],
    
    // Import
    'import/order': ['error', {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      'newlines-between': 'always',
    }],
    'import/no-cycle': 'error',
    
    // Security
    'no-eval': 'error',
    'no-implied-eval': 'error',
  },
};
```

---

## Checklist de Code Review

### Para o Autor

- [ ] PR está pequeno e focado (< 400 linhas)
- [ ] Descrição clara do que foi feito e por quê
- [ ] Self-review realizado
- [ ] Testes adicionados/atualizados
- [ ] Documentação atualizada

### Para o Reviewer

- [ ] Código segue convenções do projeto
- [ ] Lógica está correta e clara
- [ ] Error handling adequado
- [ ] Sem problemas de segurança
- [ ] Sem regressões de performance
- [ ] Testes cobrem casos importantes
- [ ] Sem código morto ou comentado
