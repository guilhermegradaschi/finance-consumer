# 09 - Instruções para AI Agents

## Propósito

Este documento fornece instruções estruturadas para AI coding agents atuarem no repositório finance-consumer. Siga estas diretrizes para garantir edições seguras, consistentes e de alta qualidade.

---

## Configuração do Ambiente

### Estrutura do Projeto

```
finance-consumer/
├── src/
│   ├── main.ts                    # Bootstrap da aplicação
│   ├── app.module.ts              # Módulo raiz
│   ├── common/                    # Código compartilhado
│   │   ├── constants/             # Constantes (queues, error-codes)
│   │   ├── enums/                 # Enumerações
│   │   ├── exceptions/            # Classes de exceção
│   │   ├── filters/               # Exception filters
│   │   ├── guards/                # Auth guards
│   │   ├── interceptors/          # Interceptors
│   │   └── utils/                 # Funções utilitárias
│   ├── config/                    # Configurações (env, db, auth)
│   ├── infrastructure/            # Infraestrutura técnica
│   │   ├── database/              # TypeORM config
│   │   ├── observability/         # Logs, métricas
│   │   ├── rabbitmq/              # Message broker
│   │   ├── redis/                 # Cache, idempotência
│   │   └── s3/                    # Object storage
│   ├── migrations/                # Migrations TypeORM
│   └── modules/                   # Módulos de domínio
│       ├── api-gateway/           # Controllers REST
│       ├── business-validator/    # Validação de negócio
│       ├── nf-receiver/           # Recepção de NF-e
│       ├── persistence/           # Persistência
│       └── xml-processor/         # Parse de XML
├── test/                          # Testes
├── k8s/                           # Manifests Kubernetes
├── .github/workflows/             # CI/CD
├── package.json
├── tsconfig.json
└── .env.example
```

### Stack Tecnológica

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| Node.js | 20.x LTS | Runtime |
| NestJS | 10.4.x | Framework |
| TypeScript | 5.x | Linguagem |
| PostgreSQL | 16 | Database |
| TypeORM | 0.3.20 | ORM |
| RabbitMQ | 3.13 | Message Broker |
| Redis | 7.x | Cache/Idempotência |
| Jest | 29.x | Testes |

---

## Como Ler o Contexto

### Antes de Qualquer Edição

1. **Identifique o módulo alvo**:
   ```
   src/modules/{module-name}/
   ```

2. **Verifique arquivos relacionados**:
   - `{module}.module.ts` - Definição do módulo
   - `services/*.service.ts` - Lógica de negócio
   - `consumers/*.consumer.ts` - Consumers RabbitMQ
   - `dtos/*.dto.ts` - Data Transfer Objects
   - `entities/*.entity.ts` - Entidades TypeORM

3. **Entenda as dependências**:
   ```typescript
   // Verifique imports no module
   @Module({
     imports: [RabbitMqModule, RedisModule], // Dependências
     providers: [MyService],
     exports: [MyService],
   })
   ```

4. **Localize testes existentes**:
   ```
   src/modules/{module}/__tests__/
   test/{module}/
   ```

### Contexto Essencial por Área

#### Para editar API/Controllers:
```
Ler:
- src/modules/api-gateway/controllers/{controller}.ts
- src/modules/api-gateway/dtos/*.dto.ts
- src/common/guards/*.guard.ts
- src/common/filters/global-exception.filter.ts
```

#### Para editar Consumers:
```
Ler:
- src/modules/{module}/consumers/{consumer}.consumer.ts
- src/infrastructure/rabbitmq/rabbitmq.service.ts
- src/common/constants/queues.ts
- src/common/exceptions/*.exception.ts
```

#### Para editar Persistência:
```
Ler:
- src/modules/persistence/entities/*.entity.ts
- src/modules/persistence/repositories/*.repository.ts
- src/infrastructure/database/database.module.ts
- src/migrations/
```

#### Para editar Infraestrutura:
```
Ler:
- src/infrastructure/{area}/*.ts
- src/config/{area}.config.ts
- .env.example
```

---

## Como Editar com Segurança

### Checklist Pré-Edição

```markdown
- [ ] Li os arquivos relacionados ao módulo
- [ ] Entendi o propósito do código existente
- [ ] Identifiquei testes existentes
- [ ] Verifiquei imports e dependências
- [ ] Consultei as regras em 06-development-rules.md
```

### Padrões de Edição

#### 1. Criar Novo Service

```typescript
// Localização: src/modules/{module}/services/{name}.service.ts

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MyNewService {
  private readonly logger = new Logger(MyNewService.name);

  constructor(
    // Injetar dependências via constructor
    private readonly someRepository: SomeRepository,
  ) {}

  async doSomething(input: InputDto): Promise<OutputDto> {
    this.logger.log(`Processing: ${input.id}`);
    
    try {
      // Implementação
      const result = await this.someRepository.findById(input.id);
      
      if (!result) {
        throw new NotFoundException(`Item ${input.id} not found`);
      }
      
      return OutputDto.fromEntity(result);
    } catch (error) {
      this.logger.error(`Error processing ${input.id}`, error.stack);
      throw error;
    }
  }
}
```

#### 2. Criar Novo Consumer

```typescript
// Localização: src/modules/{module}/consumers/{name}.consumer.ts

import { Injectable } from '@nestjs/common';
import { BaseConsumer } from '@infrastructure/rabbitmq/base-consumer';
import { QUEUES } from '@common/constants/queues';

@Injectable()
export class MyNewConsumer extends BaseConsumer<MyEventType> {
  protected readonly queueName = QUEUES.MY_QUEUE;
  protected readonly dlqName = QUEUES.MY_QUEUE_DLQ;

  protected async process(data: MyEventType, context: MessageContext): Promise<void> {
    // Implementar lógica específica
    await this.myService.processEvent(data);
  }

  protected isRetryable(error: Error): boolean {
    return error instanceof RetryableException;
  }
}
```

#### 3. Criar Nova Exception

```typescript
// Localização: src/common/exceptions/domain/{name}.exception.ts

import { NonRetryableException } from '../non-retryable.exception';

export class MyDomainException extends NonRetryableException {
  readonly httpStatusCode = 400;
  readonly errorCode = 'MY_DOMAIN_ERROR';

  constructor(details: string, context?: Record<string, unknown>) {
    super(`My domain error: ${details}`, context);
  }
}

// Exportar em src/common/exceptions/index.ts
export * from './domain/my-domain.exception';
```

#### 4. Criar Novo DTO

```typescript
// Localização: src/modules/{module}/dtos/{name}.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { IsChaveAcesso } from '@common/validators';

export class MyRequestDto {
  @ApiProperty({ description: 'Chave de acesso da NF-e', example: '12345678901234567890123456789012345678901234' })
  @IsChaveAcesso()
  chaveAcesso: string;

  @ApiProperty({ description: 'Observação opcional', required: false })
  @IsOptional()
  @IsString()
  observacao?: string;
}

export class MyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  status: string;

  static fromEntity(entity: MyEntity): MyResponseDto {
    return {
      id: entity.id,
      status: entity.status,
    };
  }
}
```

### Checklist Pós-Edição

```markdown
- [ ] Código compila sem erros (pnpm run build)
- [ ] Lint passa (pnpm run lint)
- [ ] Testes existentes passam (pnpm run test)
- [ ] Novos testes adicionados para nova funcionalidade
- [ ] Tipos explícitos em todas as funções
- [ ] Sem any types
- [ ] Error handling adequado
- [ ] Logs adicionados onde apropriado
```

---

## Como Validar a Entrega

### Validação Local

```bash
# 1. Instalar dependências
pnpm install --frozen-lockfile

# 2. Verificar lint
pnpm run lint

# 3. Verificar tipos
pnpm run build

# 4. Rodar testes unitários
pnpm run test

# 5. Rodar testes com cobertura
pnpm run test:cov

# 6. Verificar cobertura mínima
# Cobertura deve ser >= 85%
```

### Validação de Integração

```bash
# Subir dependências locais
docker-compose up -d postgres redis rabbitmq

# Rodar migrations
pnpm run migration:run

# Rodar testes de integração
pnpm run test:integration

# Testar manualmente (opcional)
pnpm run start:dev
curl http://localhost:3000/health/ready
```

### Critérios de Aceite Padrão

Todo PR deve atender:

| Critério | Verificação |
|----------|-------------|
| Compila | `pnpm run build` sem erros |
| Lint | `pnpm run lint` sem warnings |
| Testes | `pnpm run test` 100% passando |
| Cobertura | >= 85% para novos arquivos |
| Tipos | Zero `any` explícito |
| Docs | JSDoc em interfaces públicas |

---

## Formato de Execução de Tarefas

### Template de Task

Quando receber uma task do `05-agent-task-list.md`, siga este fluxo:

```markdown
## TASK-XXX: [Título]

### 1. Análise
- Arquivos a ler: [lista]
- Arquivos a criar/modificar: [lista]
- Dependências: [lista de TASK-IDs]

### 2. Implementação
[Código ou descrição das mudanças]

### 3. Testes
[Testes criados/atualizados]

### 4. Validação
- [ ] pnpm run build ✓
- [ ] pnpm run lint ✓
- [ ] pnpm run test ✓
- [ ] Cobertura >= 85% ✓

### 5. Arquivos Modificados
- `path/to/file1.ts` - [descrição da mudança]
- `path/to/file2.ts` - [descrição da mudança]
```

### Exemplo de Execução

```markdown
## TASK-001: Remover JWT Secret Default

### 1. Análise
- Arquivos a ler:
  - `.env.example`
  - `src/config/auth.config.ts`
- Arquivos a criar/modificar:
  - `.env.example` (modificar)
  - `src/config/auth.config.ts` (modificar)
  - `src/config/env.validation.ts` (criar)

### 2. Implementação

#### .env.example
```diff
- JWT_SECRET=dev-secret-key-change-in-production
+ # JWT_SECRET=your-secure-secret-here (min 32 chars, required)
```

#### src/config/auth.config.ts
```typescript
import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => {
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  
  return {
    jwtSecret,
    jwtExpiration: process.env.JWT_EXPIRATION || '1h',
  };
});
```

### 3. Testes
```typescript
// test/config/auth.config.spec.ts
describe('authConfig', () => {
  it('should throw if JWT_SECRET not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => authConfig()).toThrow('JWT_SECRET environment variable is required');
  });

  it('should throw if JWT_SECRET too short', () => {
    process.env.JWT_SECRET = 'short';
    expect(() => authConfig()).toThrow('at least 32 characters');
  });

  it('should return config with valid JWT_SECRET', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    const config = authConfig();
    expect(config.jwtSecret).toHaveLength(32);
  });
});
```

### 4. Validação
- [x] pnpm run build ✓
- [x] pnpm run lint ✓
- [x] pnpm run test ✓
- [x] Cobertura >= 85% ✓

### 5. Arquivos Modificados
- `.env.example` - Removido valor default de JWT_SECRET
- `src/config/auth.config.ts` - Adicionada validação de JWT_SECRET
- `test/config/auth.config.spec.ts` - Criados testes para validação
```

---

## Comandos Úteis

### Desenvolvimento

```bash
# Iniciar em modo desenvolvimento
pnpm run start:dev

# Verificar tipos sem compilar
pnpm run typecheck

# Formatar código
pnpm run format

# Gerar nova migration
pnpm run migration:generate -- -n NomeDaMigration

# Reverter última migration
pnpm run migration:revert
```

### Testes

```bash
# Rodar testes de um arquivo específico
pnpm run test -- path/to/file.spec.ts

# Rodar testes em modo watch
pnpm run test:watch

# Rodar testes com verbose
pnpm run test -- --verbose

# Rodar apenas testes que falharam
pnpm run test -- --onlyFailures
```

### Debug

```bash
# Iniciar com debug
pnpm run start:debug

# Ver logs estruturados
pnpm run start:dev 2>&1 | jq .
```

---

## Regras Críticas

### NUNCA Fazer

```typescript
// ❌ NUNCA usar any
const data: any = await fetch();

// ❌ NUNCA ignorar erros
try { doSomething(); } catch {}

// ❌ NUNCA hardcodar secrets
const JWT_SECRET = 'my-secret';

// ❌ NUNCA commitar .env
// .env deve estar no .gitignore

// ❌ NUNCA usar console.log em produção
console.log('debug'); // Use this.logger

// ❌ NUNCA fazer queries SQL raw sem parametrização
const result = `SELECT * FROM users WHERE id = '${userId}'`;
```

### SEMPRE Fazer

```typescript
// ✅ SEMPRE tipar explicitamente
async function process(data: InputDto): Promise<OutputDto> {}

// ✅ SEMPRE tratar erros
try {
  await doSomething();
} catch (error) {
  if (error instanceof KnownException) {
    this.logger.warn('Known error', { error });
    throw error;
  }
  this.logger.error('Unexpected error', { error });
  throw new InternalServerException('Processing failed', { cause: error });
}

// ✅ SEMPRE usar variáveis de ambiente
const secret = this.configService.get<string>('JWT_SECRET');

// ✅ SEMPRE usar logger estruturado
this.logger.log('Processing NF', { nfId, correlationId });

// ✅ SEMPRE parametrizar queries
const result = await this.repository.findOne({ where: { id: userId } });
```

---

## Resolução de Problemas Comuns

### Erro: "Cannot find module"

```bash
# Verificar path aliases no tsconfig.json
# Verificar se jest.config.js tem moduleNameMapper correspondente

# Limpar cache
rm -rf dist node_modules/.cache
pnpm run build
```

### Erro: "Type X is not assignable to type Y"

```typescript
// Verificar se interface mudou
// Usar type guard se necessário
function isMyType(value: unknown): value is MyType {
  return typeof value === 'object' && value !== null && 'requiredProp' in value;
}
```

### Erro: "Circular dependency detected"

```typescript
// Usar forwardRef para resolver
@Inject(forwardRef(() => OtherService))
private readonly otherService: OtherService;

// Ou melhor: refatorar para eliminar circularidade
```

### Testes Falhando por Timeout

```typescript
// Aumentar timeout em testes async
it('should process large file', async () => {
  // ...
}, 30000); // 30 segundos

// Ou configurar globalmente em jest.config.js
testTimeout: 10000
```

---

## Referências Rápidas

| Documento | Propósito |
|-----------|-----------|
| `00-overview.md` | Visão geral do serviço |
| `01-architecture-audit.md` | Problemas de arquitetura |
| `02-code-quality-audit.md` | Problemas de código |
| `03-infra-audit.md` | Problemas de infraestrutura |
| `04-refactor-roadmap.md` | Ordem de execução |
| `05-agent-task-list.md` | Tarefas atomizadas |
| `06-development-rules.md` | Regras obrigatórias |
| `07-risk-register.md` | Riscos identificados |
| `08-improvement-backlog.md` | Backlog priorizado |

---

## Suporte

Se encontrar situações não cobertas por este documento:

1. Consulte a documentação oficial do NestJS
2. Verifique os testes existentes como exemplo
3. Siga o padrão mais similar no codebase
4. Em caso de dúvida, priorize segurança e clareza sobre concisão
