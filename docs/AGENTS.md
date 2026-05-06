# AGENTS.md - Manual de Desenvolvimento para Agentes de IA

## 1. VISÃO GERAL PARA O AGENTE

### Seu Papel
Você é um agente de IA responsável por implementar um sistema de processamento de Notas Fiscais usando NestJS. Este documento contém TODAS as diretrizes, padrões e instruções que você DEVE seguir.

### Princípios Fundamentais
- SEMPRE siga as especificações exatas dos arquivos .md de referência
- NUNCA invente soluções não documentadas
- SEMPRE implemente tratamento de erros completo
- SEMPRE adicione logging apropriado
- SEMPRE escreva testes para cada componente
- SEMPRE valide inputs e outputs
- SEMPRE use TypeScript strict mode
- SEMPRE siga convenções NestJS

---

## 2. ORDEM DE IMPLEMENTAÇÃO OBRIGATÓRIA

### Fase 1: Setup Inicial (OBRIGATÓRIO PRIMEIRO)
1. Inicializar projeto NestJS
2. Configurar TypeScript (strict mode)
3. Configurar ESLint e Prettier
4. Configurar estrutura de pastas (seguir ARCHITECTURE.md)
5. Configurar variáveis de ambiente (seguir ENVIRONMENT.md)
6. Configurar Docker Compose para desenvolvimento local

### Fase 2: Infraestrutura (OBRIGATÓRIO SEGUNDO)
1. Implementar DatabaseModule (PostgreSQL + TypeORM)
2. Implementar RedisModule
3. Implementar RabbitMQModule
4. Implementar S3Module
5. Implementar SignozModule (Observabilidade)
6. Testar cada módulo de infraestrutura isoladamente

### Fase 3: Entities e Database (OBRIGATÓRIO TERCEIRO)
1. Criar todas as entities (seguir DATABASE.md)
2. Criar migrations
3. Criar repositories customizados
4. Testar conexão e queries básicas

### Fase 4: Messaging (OBRIGATÓRIO QUARTO)
1. Configurar exchanges, queues e bindings RabbitMQ
2. Implementar event DTOs (seguir MESSAGING.md)
3. Implementar RabbitMQService (publisher/consumer base)
4. Testar publicação e consumo de mensagens

### Fase 5: Módulos Core (OBRIGATÓRIO QUINTO)
Implementar na ordem:
1. NfReceiverModule
2. XmlProcessorModule
3. BusinessValidatorModule
4. PersistenceModule

Para cada módulo:
- Implementar service
- Implementar consumer
- Implementar DTOs
- Implementar testes unitários
- Implementar testes de integração
- Validar fluxo completo

### Fase 6: Entry Points (OBRIGATÓRIO SEXTO)
1. ApiGatewayModule (REST API)
2. EmailConsumerModule
3. S3ListenerModule

### Fase 7: Testes e Validação (OBRIGATÓRIO SÉTIMO)
1. Testes E2E completos
2. Testes de carga
3. Validação de métricas
4. Validação de logs

### Fase 8: Deploy (OBRIGATÓRIO OITAVO)
1. Dockerfile
2. Kubernetes manifests
3. CI/CD pipeline

---

## 3. PADRÕES DE CÓDIGO OBRIGATÓRIOS

### Estrutura de Arquivos
```
src/
├── modules/
│   └── [module-name]/
│       ├── [module-name].module.ts
│       ├── [module-name].service.ts
│       ├── [module-name].consumer.ts (se aplicável)
│       ├── [module-name].controller.ts (se aplicável)
│       ├── dto/
│       │   ├── [name].dto.ts
│       │   └── [name]-event.dto.ts
│       └── [module-name].spec.ts
```

### Nomenclatura Obrigatória
- **Modules**: `NomeModule` (PascalCase + Module)
- **Services**: `NomeService` (PascalCase + Service)
- **Controllers**: `NomeController` (PascalCase + Controller)
- **Consumers**: `NomeConsumer` (PascalCase + Consumer)
- **DTOs**: `NomeDto` (PascalCase + Dto)
- **Entities**: `NomeEntity` (PascalCase + Entity)
- **Interfaces**: `INome` (I + PascalCase)
- **Enums**: `NomeEnum` (PascalCase + Enum)
- **Constants**: `NOME_CONSTANT` (UPPER_SNAKE_CASE)

### Template de Service
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class NomeService {
  private readonly logger = new Logger(NomeService.name);

  constructor(
    @InjectRepository(EntityName)
    private readonly repository: Repository<EntityName>,
    // outros injects
  ) {}

  async metodo(param: Type): Promise<ReturnType> {
    this.logger.log(`Iniciando metodo com param: ${param}`);

    try {
      // lógica

      this.logger.log(`Metodo concluído com sucesso`);
      return result;
    } catch (error) {
      this.logger.error(`Erro no metodo: ${error.message}`, error.stack);
      throw error;
    }
  }
}
```

### Template de Consumer
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';

@Injectable()
export class NomeConsumer {
  private readonly logger = new Logger(NomeConsumer.name);

  constructor(
    private readonly service: NomeService,
  ) {}

  @RabbitSubscribe({
    exchange: 'nf.exchange',
    routingKey: 'nf.event',
    queue: 'nf.queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'nf.dlx',
      deadLetterRoutingKey: 'nf.event.dlq',
    },
  })
  async handleEvent(
    message: EventDto,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    this.logger.log(`Recebido evento: ${JSON.stringify(message)}`);

    try {
      await this.service.process(message);
      this.logger.log(`Evento processado com sucesso`);
    } catch (error) {
      this.logger.error(`Erro ao processar evento: ${error.message}`, error.stack);
      throw error; // Requeue ou DLQ
    }
  }
}
```

### Template de Controller
```typescript
import { Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('nome')
@Controller('api/v1/nome')
export class NomeController {
  private readonly logger = new Logger(NomeController.name);

  constructor(private readonly service: NomeService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Descrição' })
  @ApiResponse({ status: 202, description: 'Aceito' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async create(@Body() dto: CreateDto): Promise<ResponseDto> {
    this.logger.log(`POST /api/v1/nome - ${JSON.stringify(dto)}`);
    return this.service.create(dto);
  }
}
```

### Template de DTO
```typescript
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NomeDto {
  @ApiProperty({ description: 'Descrição', example: 'exemplo' })
  @IsString()
  @IsNotEmpty()
  campo: string;

  @ApiPropertyOptional({ description: 'Descrição opcional' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  campoOpcional?: number;
}
```

### Template de Entity
```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('nome_tabela')
@Index(['campo1', 'campo2'])
export class NomeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  @Index()
  campo: string;

  @Column({ type: 'int', default: 0 })
  contador: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

---

## 4. TRATAMENTO DE ERROS OBRIGATÓRIO

### Hierarquia de Exceções
```typescript
// src/common/exceptions/base.exception.ts
export class BaseException extends Error {
  constructor(
    public readonly message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: any,
  ) {
    super(message);
  }
}

// src/common/exceptions/business.exception.ts
export class BusinessException extends BaseException {
  constructor(message: string, code: string, details?: any) {
    super(message, code, 400, details);
  }
}

// src/common/exceptions/infrastructure.exception.ts
export class InfrastructureException extends BaseException {
  constructor(message: string, code: string, details?: any) {
    super(message, code, 500, details);
  }
}
```

### Exception Filter Global
```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof BaseException) {
      status = exception.statusCode;
      message = exception.message;
      code = exception.code;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    }

    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : '',
    );

    response.status(status).json({
      statusCode: status,
      message,
      code,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

---

## 5. LOGGING OBRIGATÓRIO

### Níveis de Log
- **LOG**: Operações normais (início/fim de processamento)
- **DEBUG**: Informações detalhadas para debug
- **WARN**: Situações anormais mas recuperáveis
- **ERROR**: Erros que requerem atenção

### Padrão de Logging
```typescript
// Início de operação
this.logger.log(`Iniciando processamento de NF: ${chaveAcesso}`);

// Operação bem-sucedida
this.logger.log(`NF ${chaveAcesso} processada com sucesso em ${duration}ms`);

// Warning
this.logger.warn(`NF ${chaveAcesso} já foi processada anteriormente`);

// Erro
this.logger.error(
  `Erro ao processar NF ${chaveAcesso}: ${error.message}`,
  error.stack,
);

// Debug (apenas em desenvolvimento)
this.logger.debug(`Detalhes da NF: ${JSON.stringify(metadata)}`);
```

### Contexto Obrigatório em Logs
SEMPRE incluir:
- Identificador único (chave_acesso, transaction_id)
- Ação sendo executada
- Resultado (sucesso/falha)
- Duração (quando aplicável)

---

## 6. VALIDAÇÕES OBRIGATÓRIAS

### Input Validation
SEMPRE validar:
- Todos os DTOs com class-validator
- Todos os parâmetros de rota
- Todos os query parameters
- Todos os headers necessários

### Business Validation
SEMPRE validar:
- Idempotência antes de processar
- Existência de recursos antes de atualizar
- Permissões antes de executar ações
- Integridade de dados antes de persistir

### Output Validation
SEMPRE validar:
- Respostas de APIs externas
- Dados antes de publicar em filas
- Dados antes de salvar no banco

---

## 7. TESTES OBRIGATÓRIOS

### Para Cada Service
```typescript
describe('NomeService', () => {
  let service: NomeService;
  let repository: Repository<Entity>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NomeService,
        {
          provide: getRepositoryToken(Entity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NomeService>(NomeService);
    repository = module.get(getRepositoryToken(Entity));
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('metodo', () => {
    it('deve processar com sucesso', async () => {
      // Arrange
      const input = { /* ... */ };
      jest.spyOn(repository, 'save').mockResolvedValue(/* ... */);

      // Act
      const result = await service.metodo(input);

      // Assert
      expect(result).toBeDefined();
      expect(repository.save).toHaveBeenCalledWith(/* ... */);
    });

    it('deve lançar erro quando falhar', async () => {
      // Arrange
      jest.spyOn(repository, 'save').mockRejectedValue(new Error('Erro'));

      // Act & Assert
      await expect(service.metodo({})).rejects.toThrow();
    });
  });
});
```

### Coverage Mínimo Obrigatório
- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Lines**: 80%

---

## 8. CHECKLIST DE VALIDAÇÃO

### Antes de Considerar um Módulo Completo
- [ ] Service implementado com todos os métodos
- [ ] Consumer implementado (se aplicável)
- [ ] Controller implementado (se aplicável)
- [ ] DTOs criados e validados
- [ ] Testes unitários escritos (coverage > 80%)
- [ ] Testes de integração escritos
- [ ] Logging implementado em todos os pontos
- [ ] Tratamento de erros implementado
- [ ] Documentação inline (JSDoc)
- [ ] Swagger annotations (se API)
- [ ] Validação de inputs
- [ ] Validação de outputs
- [ ] Métricas implementadas
- [ ] Tracing implementado

### Antes de Considerar o Sistema Completo
- [ ] Todos os módulos implementados
- [ ] Testes E2E passando
- [ ] Testes de carga executados
- [ ] Dockerfile funcional
- [ ] docker-compose funcional
- [ ] Kubernetes manifests criados
- [ ] CI/CD pipeline configurado
- [ ] Variáveis de ambiente documentadas
- [ ] README.md completo
- [ ] Migrations criadas
- [ ] Seeds criados (se necessário)
- [ ] Health checks implementados
- [ ] Observabilidade configurada

---

## 9. BOAS PRÁTICAS OBRIGATÓRIAS

### Dependency Injection
- SEMPRE use constructor injection
- NUNCA use property injection
- SEMPRE declare dependências como private readonly

### Async/Await
- SEMPRE use async/await (nunca .then/.catch)
- SEMPRE trate erros com try/catch
- SEMPRE retorne Promises tipadas

### TypeScript
- SEMPRE use tipos explícitos
- NUNCA use 'any'
- SEMPRE use interfaces para contratos
- SEMPRE use enums para valores fixos

### Performance
- SEMPRE use índices em queries frequentes
- SEMPRE use paginação em listagens
- SEMPRE use cache quando apropriado
- SEMPRE use connection pooling

### Segurança
- SEMPRE valide e sanitize inputs
- SEMPRE use prepared statements
- SEMPRE use HTTPS em produção
- SEMPRE armazene secrets em variáveis de ambiente
- NUNCA commite secrets no código

---

## 10. COMANDOS ÚTEIS

### Setup Inicial
```bash
# Criar projeto
nest new finance-consumer

# Instalar dependências
pnpm add @nestjs/typeorm typeorm pg
pnpm add @nestjs/config
pnpm add @golevelup/nestjs-rabbitmq
pnpm add @nestjs/swagger
pnpm add class-validator class-transformer
pnpm add ioredis
pnpm add @aws-sdk/client-s3

# Dev dependencies
pnpm add -D @types/node
pnpm add -D @nestjs/testing
pnpm add -D jest
pnpm add -D supertest
```

### Desenvolvimento
```bash
# Rodar em desenvolvimento
pnpm run start:dev

# Rodar testes
pnpm run test
pnpm run test:watch
pnpm run test:cov

# Rodar testes E2E
pnpm run test:e2e

# Lint
pnpm run lint
pnpm run format
```

### Database
```bash
# Criar migration
pnpm run typeorm migration:create -- -n NomeMigration

# Rodar migrations
pnpm run typeorm migration:run

# Reverter migration
pnpm run typeorm migration:revert
```

---

## 11. TROUBLESHOOTING

### Problema: Conexão com PostgreSQL falha
**Solução**: Verificar DATABASE_URL, verificar se PostgreSQL está rodando, verificar credenciais e porta no `.env`.

### Problema: RabbitMQ não conecta
**Solução**: Verificar RABBITMQ_URL, verificar se RabbitMQ está rodando, verificar management plugin habilitado.

### Problema: Testes falhando
**Solução**: Verificar mocks, verificar setup de teste, verificar imports, rodar `pnpm run test -- --verbose` para detalhes.

### Problema: Build falha
**Solução**: Verificar tipos TypeScript, verificar imports circulares, rodar `pnpm install` e limpar `dist/`.

### Problema: Consumer não recebe mensagens
**Solução**: Verificar exchange/queue/routing key, verificar bindings no RabbitMQ Management UI, verificar se consumer está registrado.

### Problema: Migrations falham
**Solução**: Verificar conexão com banco, verificar estado atual das migrations com `migration:show`, verificar SQL gerado.

---

## 12. REFERÊNCIAS OBRIGATÓRIAS

Ao implementar, SEMPRE consulte:
- `ARCHITECTURE.md` - Estrutura geral do sistema e decisões arquiteturais
- `DATABASE.md` - Schema completo, entities, relacionamentos e índices
- `MESSAGING.md` - Eventos, exchanges, queues, bindings e dead letter queues
- `MODULES.md` - Detalhes de cada módulo, responsabilidades e dependências
- `API_CONTRACTS.md` - Endpoints REST, DTOs de request/response e códigos HTTP
- `INFRASTRUCTURE.md` - Configurações de PostgreSQL, Redis, RabbitMQ, S3 e Signoz
- `FLOWS.md` - Fluxos completos de processamento passo a passo
- `TESTING.md` - Estratégia de testes, fixtures e mocks
- `CODE_EXAMPLES.md` - Exemplos concretos de implementação
- `ENVIRONMENT.md` - Variáveis de ambiente e configurações por ambiente

---

## 13. REGRAS DE OURO

1. **NUNCA** pule etapas da ordem de implementação
2. **SEMPRE** escreva testes antes de considerar completo
3. **SEMPRE** adicione logging em operações importantes
4. **SEMPRE** trate erros adequadamente
5. **SEMPRE** valide inputs e outputs
6. **SEMPRE** siga os padrões de código definidos neste documento
7. **SEMPRE** consulte a documentação de referência antes de implementar
8. **NUNCA** invente soluções não documentadas sem justificativa explícita
9. **SEMPRE** use TypeScript strict mode sem exceções
10. **SEMPRE** documente código complexo com JSDoc
11. **NUNCA** use `any` — use `unknown` e faça type narrowing quando necessário
12. **SEMPRE** implemente idempotência em consumers e endpoints de escrita
13. **SEMPRE** configure dead letter queues para tratamento de mensagens com falha
14. **NUNCA** ignore erros silenciosamente — log e re-throw ou trate explicitamente

---

## 14. CRITÉRIOS DE ACEITAÇÃO

Um módulo/feature só está COMPLETO quando:
- ✅ Código implementado seguindo todos os padrões deste documento
- ✅ Testes unitários passando (coverage > 80%)
- ✅ Testes de integração passando
- ✅ Logging implementado em todos os pontos críticos
- ✅ Tratamento de erros implementado com hierarquia de exceções
- ✅ Validações de input/output implementadas
- ✅ Documentação inline (JSDoc) presente em métodos públicos
- ✅ Sem warnings do TypeScript compiler
- ✅ Sem warnings do ESLint
- ✅ Swagger annotations presentes (se expõe API REST)
- ✅ Métricas e tracing configurados
- ✅ Code review aprovado (se aplicável)
