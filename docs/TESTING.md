# TESTING.md — Estratégia de Testes, Unitários, Integração e E2E

## 1. Estratégia de Testes

| Tipo              | Escopo                            | Ferramentas               | Coverage Alvo |
|-------------------|-----------------------------------|---------------------------|---------------|
| Unitário          | Services, Utils, DTOs             | Jest + mocks              | 80%+          |
| Integração        | Módulos + DB/Redis/RabbitMQ reais | Jest + Testcontainers     | 70%+          |
| E2E               | API completa (HTTP → DB)          | Jest + Supertest          | 60%+          |
| Contract          | Eventos RabbitMQ                  | Jest                      | 100% eventos  |

### Pirâmide de Testes

```
          /\
         /  \     E2E (poucos, lentos, alto valor)
        /----\
       /      \   Integração (moderados)
      /--------\
     /          \ Unitários (muitos, rápidos)
    /____________\
```

---

## 2. Setup de Ambiente de Testes

### 2.1 Configuração Jest

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.enum.ts',
    '!src/**/*.constants.ts',
    '!src/infrastructure/observability/tracing.config.ts',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
```

### 2.2 Configuração Jest E2E

```json
// test/jest-e2e.json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^src/(.*)$": "<rootDir>/src/$1"
  }
}
```

---

## 3. Fixtures

### 3.1 XML Válido

```typescript
// src/test/fixtures/valid-nfe.xml
export const VALID_NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35240112345678000195550010000001231234567890" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <cNF>12345678</cNF>
        <natOp>Venda de mercadoria</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>123</nNF>
        <dhEmi>2024-01-15T10:30:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>0</cDV>
        <tpAmb>2</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>1</indPres>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <xNome>Empresa Emitente LTDA</xNome>
        <xFant>Emitente</xFant>
        <enderEmit>
          <xLgr>Rua Exemplo</xLgr>
          <nro>100</nro>
          <xBairro>Centro</xBairro>
          <cMun>3550308</cMun>
          <xMun>São Paulo</xMun>
          <UF>SP</UF>
          <CEP>01001000</CEP>
        </enderEmit>
        <IE>123456789</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>98765432000100</CNPJ>
        <xNome>Empresa Destinatária SA</xNome>
        <enderDest>
          <xLgr>Av. Destino</xLgr>
          <nro>200</nro>
          <xBairro>Jardim</xBairro>
          <cMun>3550308</cMun>
          <xMun>São Paulo</xMun>
          <UF>SP</UF>
          <CEP>01002000</CEP>
        </enderDest>
        <indIEDest>1</indIEDest>
        <IE>987654321</IE>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>001</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>Produto Teste XYZ</xProd>
          <NCM>84719012</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>10.0000</qCom>
          <vUnCom>150.0000000000</vUnCom>
          <vProd>1500.00</vProd>
          <cEANTrib>SEM GTIN</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>10.0000</qTrib>
          <vUnTrib>150.0000000000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>0</modBC>
              <vBC>1500.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>270.00</vICMS>
            </ICMS00>
          </ICMS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>1500.00</vBC>
          <vICMS>270.00</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCPUFDest>0.00</vFCPUFDest>
          <vICMSUFDest>0.00</vICMSUFDest>
          <vICMSUFRemet>0.00</vICMSUFRemet>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>1500.00</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>1500.00</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>9</modFrete>
      </transp>
      <pag>
        <detPag>
          <tPag>01</tPag>
          <vPag>1500.00</vPag>
        </detPag>
      </pag>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>2</tpAmb>
      <verAplic>SP_NFE_PL009_V4</verAplic>
      <chNFe>35240112345678000195550010000001231234567890</chNFe>
      <dhRecbto>2024-01-15T10:31:00-03:00</dhRecbto>
      <nProt>135240000000001</nProt>
      <digVal>abc123def456</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;

export const VALID_CHAVE_ACESSO = '35240112345678000195550010000001231234567890';

export const INVALID_NFE_XML = `<?xml version="1.0"?><invalid>not a nfe</invalid>`;
```

---

## 4. Testes Unitários

### 4.1 NfReceiverService

```typescript
// src/modules/nf-receiver/__tests__/nf-receiver.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NfReceiverService } from '../nf-receiver.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { RabbitMQService } from '../../../infrastructure/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '../../persistence/repositories/nf-processing-log.repository';
import { NfSource } from '../../../common/enums/nf-source.enum';
import { VALID_NFE_XML, VALID_CHAVE_ACESSO, INVALID_NFE_XML } from '../../../../src/test/fixtures/valid-nfe.xml';

describe('NfReceiverService', () => {
  let service: NfReceiverService;
  let redisService: jest.Mocked<RedisService>;
  let rabbitMQService: jest.Mocked<RabbitMQService>;
  let processingLogRepo: jest.Mocked<NfProcessingLogRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NfReceiverService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            setNx: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            publish: jest.fn(),
          },
        },
        {
          provide: NfProcessingLogRepository,
          useValue: {
            logProcessingStep: jest.fn().mockResolvedValue({ id: 'log-id' }),
          },
        },
      ],
    }).compile();

    service = module.get<NfReceiverService>(NfReceiverService);
    redisService = module.get(RedisService);
    rabbitMQService = module.get(RabbitMQService);
    processingLogRepo = module.get(NfProcessingLogRepository);
  });

  describe('receive', () => {
    it('deve processar NF-e nova com sucesso', async () => {
      redisService.get.mockResolvedValue(null); // Não existe no Redis
      redisService.set.mockResolvedValue(undefined);
      rabbitMQService.publish.mockResolvedValue(undefined);

      const result = await service.receive({
        xmlContent: VALID_NFE_XML,
        source: NfSource.API,
      });

      expect(result.chaveAcesso).toBe(VALID_CHAVE_ACESSO);
      expect(result.alreadyProcessed).toBe(false);
      expect(result.status).toBe('RECEIVED');
      expect(redisService.get).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledTimes(1);
      expect(rabbitMQService.publish).toHaveBeenCalledTimes(1);
      expect(processingLogRepo.logProcessingStep).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'RECEIVE',
          status: 'SUCCESS',
        }),
      );
    });

    it('deve retornar resultado anterior para NF-e duplicada (idempotência)', async () => {
      const existingData = JSON.stringify({
        id: 'existing-id',
        status: 'RECEIVED',
        chaveAcesso: VALID_CHAVE_ACESSO,
      });
      redisService.get.mockResolvedValue(existingData);

      const result = await service.receive({
        xmlContent: VALID_NFE_XML,
        source: NfSource.API,
      });

      expect(result.alreadyProcessed).toBe(true);
      expect(result.id).toBe('existing-id');
      expect(rabbitMQService.publish).not.toHaveBeenCalled();
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('deve lançar erro para XML sem chave de acesso', async () => {
      await expect(
        service.receive({
          xmlContent: INVALID_NFE_XML,
          source: NfSource.API,
        }),
      ).rejects.toThrow('Não foi possível extrair chaveAcesso do XML');
    });

    it('deve usar source EMAIL quando especificado', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);
      rabbitMQService.publish.mockResolvedValue(undefined);

      await service.receive({
        xmlContent: VALID_NFE_XML,
        source: NfSource.EMAIL,
        metadata: { emailFrom: 'test@example.com' },
      });

      expect(rabbitMQService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            source: NfSource.EMAIL,
            metadata: expect.objectContaining({ emailFrom: 'test@example.com' }),
          }),
        }),
      );
    });
  });
});
```

### 4.2 XmlProcessorService (parcial)

```typescript
// src/modules/xml-processor/__tests__/xml-processor.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { XmlProcessorService } from '../xml-processor.service';
import { S3Service } from '../../../infrastructure/s3/s3.service';
import { RabbitMQService } from '../../../infrastructure/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '../../persistence/repositories/nf-processing-log.repository';
import { VALID_NFE_XML, VALID_CHAVE_ACESSO, INVALID_NFE_XML } from '../../../../src/test/fixtures/valid-nfe.xml';
import { NonRetryableException } from '../../../common/exceptions/non-retryable.exception';
import { RetryableException } from '../../../common/exceptions/retryable.exception';

describe('XmlProcessorService', () => {
  let service: XmlProcessorService;
  let s3Service: jest.Mocked<S3Service>;
  let rabbitMQService: jest.Mocked<RabbitMQService>;
  let processingLogRepo: jest.Mocked<NfProcessingLogRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XmlProcessorService,
        {
          provide: S3Service,
          useValue: { upload: jest.fn().mockResolvedValue('nfe/2024/key.xml') },
        },
        {
          provide: RabbitMQService,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: NfProcessingLogRepository,
          useValue: { logProcessingStep: jest.fn().mockResolvedValue({ id: 'log-id' }) },
        },
      ],
    }).compile();

    service = module.get<XmlProcessorService>(XmlProcessorService);
    s3Service = module.get(S3Service);
    rabbitMQService = module.get(RabbitMQService);
    processingLogRepo = module.get(NfProcessingLogRepository);
  });

  it('deve processar XML válido e extrair metadados', async () => {
    await service.process({
      eventId: 'event-1',
      chaveAcesso: VALID_CHAVE_ACESSO,
      xmlContent: VALID_NFE_XML,
      idempotencyKey: 'hash-1',
      source: 'API',
      traceId: 'trace-1',
      attemptNumber: 1,
    });

    expect(s3Service.upload).toHaveBeenCalledTimes(1);
    expect(rabbitMQService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'nf.processed',
        message: expect.objectContaining({
          extractedData: expect.objectContaining({
            numero: 123,
            serie: 1,
            cnpjEmitente: '12345678000195',
            valorTotalNf: 1500,
          }),
        }),
      }),
    );
  });

  it('deve lançar NonRetryableException para XML inválido', async () => {
    await expect(
      service.process({
        eventId: 'event-1',
        chaveAcesso: '00000000000000000000000000000000000000000000',
        xmlContent: '<broken xml',
        idempotencyKey: 'hash-1',
        source: 'API',
        attemptNumber: 1,
      }),
    ).rejects.toThrow(NonRetryableException);
  });

  it('deve lançar RetryableException quando S3 falhar', async () => {
    s3Service.upload.mockRejectedValue(new Error('S3 unavailable'));

    await expect(
      service.process({
        eventId: 'event-1',
        chaveAcesso: VALID_CHAVE_ACESSO,
        xmlContent: VALID_NFE_XML,
        idempotencyKey: 'hash-1',
        source: 'API',
        attemptNumber: 1,
      }),
    ).rejects.toThrow(RetryableException);
  });
});
```

### 4.3 Hash Utility

```typescript
// src/common/utils/__tests__/hash.util.spec.ts
import { generateHash } from '../hash.util';

describe('generateHash', () => {
  it('deve gerar SHA-256 hex de 64 caracteres', () => {
    const hash = generateHash('35240112345678000195550010000001231234567890');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deve gerar hash determinístico', () => {
    const input = '35240112345678000195550010000001231234567890';
    const hash1 = generateHash(input);
    const hash2 = generateHash(input);
    expect(hash1).toBe(hash2);
  });

  it('deve gerar hashes diferentes para inputs diferentes', () => {
    const hash1 = generateHash('35240112345678000195550010000001231234567890');
    const hash2 = generateHash('35240112345678000195550010000001231234567891');
    expect(hash1).not.toBe(hash2);
  });
});
```

---

## 5. Testes de Integração

### 5.1 Setup com Testcontainers

```typescript
// test/integration/setup.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedTestContainer;
let rabbitContainer: StartedTestContainer;

export async function setupTestInfra() {
  // PostgreSQL
  pgContainer = await new PostgreSqlContainer('postgres:16')
    .withDatabase('nf_processor_test')
    .withUsername('test_user')
    .withPassword('test_pass')
    .start();

  // Redis
  redisContainer = await new GenericContainer('redis:7')
    .withExposedPorts(6379)
    .start();

  // RabbitMQ
  rabbitContainer = await new GenericContainer('rabbitmq:3.13-management')
    .withExposedPorts(5672, 15672)
    .start();

  return {
    postgres: {
      host: pgContainer.getHost(),
      port: pgContainer.getMappedPort(5432),
      database: 'nf_processor_test',
      username: 'test_user',
      password: 'test_pass',
    },
    redis: {
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    },
    rabbitmq: {
      host: rabbitContainer.getHost(),
      port: rabbitContainer.getMappedPort(5672),
      managementPort: rabbitContainer.getMappedPort(15672),
    },
  };
}

export async function teardownTestInfra() {
  await pgContainer?.stop();
  await redisContainer?.stop();
  await rabbitContainer?.stop();
}
```

### 5.2 Teste de Integração: Persistence

```typescript
// test/integration/persistence.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { setupTestInfra, teardownTestInfra } from './setup';
import { PersistenceService } from '../../src/modules/persistence/persistence.service';
import { NotaFiscalRepository } from '../../src/modules/persistence/repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from '../../src/modules/persistence/repositories/nf-processing-log.repository';
import { NotaFiscal } from '../../src/modules/persistence/entities/nota-fiscal.entity';
import { NfItem } from '../../src/modules/persistence/entities/nf-item.entity';
import { NfEmitente } from '../../src/modules/persistence/entities/nf-emitente.entity';
import { NfDestinatario } from '../../src/modules/persistence/entities/nf-destinatario.entity';
import { NfTransporte } from '../../src/modules/persistence/entities/nf-transporte.entity';
import { NfPagamento } from '../../src/modules/persistence/entities/nf-pagamento.entity';
import { NfProcessingLog } from '../../src/modules/persistence/entities/nf-processing-log.entity';
import { RabbitMQService } from '../../src/infrastructure/rabbitmq/rabbitmq.service';
import { NfStatus } from '../../src/common/enums/nf-status.enum';

describe('PersistenceService (Integration)', () => {
  let module: TestingModule;
  let service: PersistenceService;
  let nfRepo: NotaFiscalRepository;
  let dataSource: DataSource;
  let infra: any;

  beforeAll(async () => {
    infra = await setupTestInfra();

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: infra.postgres.host,
          port: infra.postgres.port,
          username: infra.postgres.username,
          password: infra.postgres.password,
          database: infra.postgres.database,
          entities: [NotaFiscal, NfItem, NfEmitente, NfDestinatario, NfTransporte, NfPagamento, NfProcessingLog],
          synchronize: true, // OK para testes
        }),
        TypeOrmModule.forFeature([NotaFiscal, NfItem, NfEmitente, NfDestinatario, NfTransporte, NfPagamento, NfProcessingLog]),
      ],
      providers: [
        PersistenceService,
        NotaFiscalRepository,
        NfProcessingLogRepository,
        {
          provide: RabbitMQService,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<PersistenceService>(PersistenceService);
    nfRepo = module.get<NotaFiscalRepository>(NotaFiscalRepository);
    dataSource = module.get<DataSource>(DataSource);
  }, 60000); // 60s timeout para containers

  afterAll(async () => {
    await module.close();
    await teardownTestInfra();
  });

  afterEach(async () => {
    // Limpar tabelas entre testes
    await dataSource.query('DELETE FROM nf_processing_log');
    await dataSource.query('DELETE FROM nf_pagamento');
    await dataSource.query('DELETE FROM nf_transporte');
    await dataSource.query('DELETE FROM nf_destinatario');
    await dataSource.query('DELETE FROM nf_emitente');
    await dataSource.query('DELETE FROM nf_item');
    await dataSource.query('DELETE FROM nota_fiscal');
  });

  it('deve persistir NF-e completa com todas as relações em transação', async () => {
    const event = {
      eventId: 'evt-1',
      chaveAcesso: '35240112345678000195550010000001231234567890',
      idempotencyKey: 'idem-key-1',
      notaFiscalId: 'nf-1',
      xmlS3Key: 'nfe/2024/key.xml',
      traceId: 'trace-1',
      attemptNumber: 1,
      validationResults: { allValidationsPassed: true },
      fullNfData: {
        numero: 123,
        serie: 1,
        modelo: '55',
        dataEmissao: '2024-01-15T10:30:00-03:00',
        naturezaOperacao: 'Venda de mercadoria',
        tipoOperacao: 1,
        valorTotalProdutos: 1500,
        valorTotalNf: 1500,
        valorDesconto: 0,
        valorFrete: 0,
        valorIcms: 270,
        valorIpi: 0,
        valorPis: 0,
        valorCofins: 0,
        cnpjEmitente: '12345678000195',
        emitente: {
          cnpj: '12345678000195',
          razaoSocial: 'Empresa Emitente LTDA',
          uf: 'SP',
        },
        destinatario: {
          cnpj: '98765432000100',
          razaoSocial: 'Empresa Destinatária SA',
        },
        itens: [
          {
            numeroItem: 1,
            codigoProduto: '001',
            descricao: 'Produto Teste',
            ncm: '84719012',
            cfop: '5102',
            unidadeComercial: 'UN',
            quantidade: 10,
            valorUnitario: 150,
            valorTotal: 1500,
          },
        ],
        transporte: { modalidadeFrete: 9 },
        pagamentos: [{ formaPagamento: '01', valor: 1500 }],
      },
    };

    await service.persist(event);

    const saved = await nfRepo.findByChaveAcesso('35240112345678000195550010000001231234567890');
    expect(saved).not.toBeNull();
    expect(saved!.numero).toBe(123);
    expect(saved!.status).toBe(NfStatus.COMPLETED);
    expect(saved!.emitente.cnpj).toBe('12345678000195');
    expect(saved!.destinatario.cnpj).toBe('98765432000100');
    expect(saved!.itens).toHaveLength(1);
    expect(saved!.pagamentos).toHaveLength(1);
  }, 30000);

  it('deve fazer rollback se inserção de item falhar', async () => {
    const event = {
      eventId: 'evt-2',
      chaveAcesso: '35240112345678000195550010000001231234567891',
      idempotencyKey: 'idem-key-2',
      notaFiscalId: 'nf-2',
      xmlS3Key: 'nfe/2024/key2.xml',
      attemptNumber: 1,
      validationResults: { allValidationsPassed: true },
      fullNfData: {
        numero: 124,
        serie: 1,
        modelo: '55',
        dataEmissao: '2024-01-15T10:30:00-03:00',
        naturezaOperacao: 'Venda',
        tipoOperacao: 1,
        valorTotalProdutos: 0,
        valorTotalNf: 0,
        valorDesconto: 0,
        valorFrete: 0,
        valorIcms: 0,
        valorIpi: 0,
        valorPis: 0,
        valorCofins: 0,
        emitente: { cnpj: '12345678000195', razaoSocial: 'Emitente' },
        destinatario: { razaoSocial: 'Destinatário' },
        itens: [
          {
            // Item com campo obrigatório ausente — deve causar erro
            numeroItem: 1,
            codigoProduto: null, // NOT NULL violation
            descricao: 'Teste',
            ncm: '12345678',
            cfop: '5102',
            unidadeComercial: 'UN',
            quantidade: 1,
            valorUnitario: 10,
            valorTotal: 10,
          },
        ],
        transporte: { modalidadeFrete: 9 },
        pagamentos: [],
      },
    };

    await expect(service.persist(event)).rejects.toThrow();

    // Verificar que a NF NÃO foi persistida (rollback)
    const saved = await nfRepo.findByChaveAcesso('35240112345678000195550010000001231234567891');
    expect(saved).toBeNull();
  }, 30000);
});
```

---

## 6. Testes E2E

```typescript
// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { VALID_NFE_XML, VALID_CHAVE_ACESSO } from './fixtures/valid-nfe.xml';

describe('NF-e API (E2E)', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Gerar JWT de teste
    jwtToken = jwt.sign(
      { sub: 'test-client', roles: ['nf:submit', 'nf:read'] },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/nf', () => {
    it('deve retornar 202 para NF-e válida', () => {
      return request(app.getHttpServer())
        .post('/api/v1/nf')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ xmlContent: VALID_NFE_XML })
        .expect(202)
        .expect((res) => {
          expect(res.body.statusCode).toBe(202);
          expect(res.body.data.chaveAcesso).toBe(VALID_CHAVE_ACESSO);
          expect(res.body.data.status).toBe('RECEIVED');
          expect(res.body.data.alreadyProcessed).toBe(false);
        });
    });

    it('deve retornar 401 sem token JWT', () => {
      return request(app.getHttpServer())
        .post('/api/v1/nf')
        .send({ xmlContent: VALID_NFE_XML })
        .expect(401);
    });

    it('deve retornar 400 sem xmlContent', () => {
      return request(app.getHttpServer())
        .post('/api/v1/nf')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/v1/nf', () => {
    it('deve retornar lista paginada', () => {
      return request(app.getHttpServer())
        .get('/api/v1/nf?page=1&limit=10')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.statusCode).toBe(200);
          expect(res.body.data).toBeInstanceOf(Array);
          expect(res.body.pagination).toBeDefined();
        });
    });
  });

  describe('GET /health', () => {
    it('deve retornar status healthy', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBeDefined();
        });
    });

    it('deve retornar liveness', () => {
      return request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('alive');
        });
    });
  });
});
```

---

## 7. Comandos de Teste

```bash
# Testes unitários
npm run test

# Testes unitários com coverage
npm run test:cov

# Testes de integração
npm run test:integration

# Testes E2E
npm run test:e2e

# Watch mode
npm run test:watch

# Rodar teste específico
npx jest --testPathPattern=nf-receiver.service.spec.ts
```

### Scripts no package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:integration": "jest --config test/jest-integration.json --runInBand",
    "test:e2e": "jest --config test/jest-e2e.json --runInBand"
  }
}
```
