# MODULES.md — Detalhamento Completo de Cada Módulo

---

## 1. NF Receiver Module

### 1.1 Responsabilidades

- Receber XML de NF-e via API REST (canal principal).
- Gerar `idempotencyKey` a partir da `chaveAcesso`.
- Verificar idempotência no Redis.
- Publicar evento `nf.received` no RabbitMQ.
- Registrar log de processamento.

### 1.2 Fluxo Interno

```
1. Controller recebe POST /api/v1/nf com XML no body
2. DTO é validado (class-validator)
3. Service extrai chaveAcesso do XML (quick parse, sem validação XSD)
4. Service gera idempotencyKey = SHA-256(chaveAcesso)
5. Service verifica Redis: idempotencyKey existe?
   5a. SIM → Retorna 200 com resultado anterior (idempotente)
   5b. NÃO → Continua
6. Service grava idempotencyKey no Redis (TTL 24h)
7. Service publica evento nf.received no RabbitMQ
8. Service registra log (stage=RECEIVE, status=SUCCESS)
9. Controller retorna 202 Accepted com { id, chaveAcesso, status: RECEIVED }
```

### 1.3 DTOs

```typescript
// src/modules/nf-receiver/dto/receive-nf.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NfSource } from '../../../common/enums/nf-source.enum';

export class ReceiveNfDto {
  @ApiProperty({
    description: 'Conteúdo XML completo da NF-e',
    example: '<?xml version="1.0"?><nfeProc>...</nfeProc>',
  })
  @IsString()
  @IsNotEmpty({ message: 'xmlContent é obrigatório' })
  xmlContent: string;

  @ApiPropertyOptional({
    description: 'Fonte de origem (default: API)',
    enum: NfSource,
    default: NfSource.API,
  })
  @IsOptional()
  @IsEnum(NfSource)
  source?: NfSource;

  @ApiPropertyOptional({
    description: 'Metadados adicionais',
    example: { clientId: 'erp-001' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}
```

```typescript
// src/modules/nf-receiver/dto/nf-received-event.dto.ts
export class NfReceivedEventDto {
  eventId: string;
  timestamp: string;
  source: string;
  chaveAcesso: string;
  xmlContent: string;
  idempotencyKey: string;
  traceId?: string;
  metadata?: Record<string, any>;
  attemptNumber: number;
}
```

### 1.4 Service

```typescript
// src/modules/nf-receiver/nf-receiver.service.ts
import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '../persistence/repositories/nf-processing-log.repository';
import { ReceiveNfDto } from './dto/receive-nf.dto';
import { NfReceivedEventDto } from './dto/nf-received-event.dto';
import { ROUTING_KEYS } from '../../common/constants/queues.constants';
import { NfSource } from '../../common/enums/nf-source.enum';
import { generateHash } from '../../common/utils/hash.util';
import { extractChaveAcessoFromXml } from '../../common/utils/xml.util';

export interface ReceiveResult {
  id: string;
  chaveAcesso: string;
  idempotencyKey: string;
  status: string;
  alreadyProcessed: boolean;
}

@Injectable()
export class NfReceiverService {
  private readonly logger = new Logger(NfReceiverService.name);
  private readonly IDEMPOTENCY_TTL_SECONDS = 86400; // 24h

  constructor(
    private readonly redisService: RedisService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly processingLogRepo: NfProcessingLogRepository,
  ) {}

  async receive(dto: ReceiveNfDto, traceId?: string): Promise<ReceiveResult> {
    const startTime = Date.now();
    const source = dto.source || NfSource.API;

    // 1. Extrair chave de acesso do XML (parse rápido, sem validação XSD)
    const chaveAcesso = extractChaveAcessoFromXml(dto.xmlContent);
    if (!chaveAcesso) {
      throw new Error('Não foi possível extrair chaveAcesso do XML');
    }

    // 2. Gerar idempotency key
    const idempotencyKey = generateHash(chaveAcesso);

    // 3. Verificar idempotência no Redis
    const existingResult = await this.redisService.get(`idempotency:${idempotencyKey}`);
    if (existingResult) {
      this.logger.log(`NF já recebida (idempotente): chaveAcesso=${chaveAcesso}`);
      const parsed = JSON.parse(existingResult);
      return {
        id: parsed.id,
        chaveAcesso,
        idempotencyKey,
        status: parsed.status,
        alreadyProcessed: true,
      };
    }

    // 4. Gerar ID do evento
    const eventId = uuidv4();

    // 5. Gravar idempotency key no Redis
    await this.redisService.set(
      `idempotency:${idempotencyKey}`,
      JSON.stringify({ id: eventId, status: 'RECEIVED', chaveAcesso }),
      this.IDEMPOTENCY_TTL_SECONDS,
    );

    // 6. Publicar evento nf.received
    const event: NfReceivedEventDto = {
      eventId,
      timestamp: new Date().toISOString(),
      source,
      chaveAcesso,
      xmlContent: dto.xmlContent,
      idempotencyKey,
      traceId,
      metadata: dto.metadata || {},
      attemptNumber: 1,
    };

    await this.rabbitMQService.publish({
      routingKey: ROUTING_KEYS.NF_RECEIVED,
      message: event,
    });

    // 7. Registrar log de processamento
    const durationMs = Date.now() - startTime;
    await this.processingLogRepo.logProcessingStep({
      chaveAcesso,
      stage: 'RECEIVE',
      status: 'SUCCESS',
      source,
      durationMs,
      traceId,
      metadata: { source, eventId },
    });

    this.logger.log(`NF recebida: chaveAcesso=${chaveAcesso}, eventId=${eventId}, duration=${durationMs}ms`);

    return {
      id: eventId,
      chaveAcesso,
      idempotencyKey,
      status: 'RECEIVED',
      alreadyProcessed: false,
    };
  }
}
```

### 1.5 Utilities

```typescript
// src/common/utils/hash.util.ts
import { createHash } from 'crypto';

export function generateHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
```

```typescript
// src/common/utils/xml.util.ts

/**
 * Extrai a chave de acesso de 44 dígitos do XML da NF-e.
 * Busca no atributo Id da tag infNFe ou no elemento chNFe.
 * Parse rápido via regex, sem validação XSD.
 */
export function extractChaveAcessoFromXml(xmlContent: string): string | null {
  // Tenta extrair do atributo Id da tag infNFe (formato: "NFe" + 44 dígitos)
  const infNFeMatch = xmlContent.match(/Id="NFe(\d{44})"/);
  if (infNFeMatch) {
    return infNFeMatch[1];
  }

  // Tenta extrair da tag chNFe
  const chNFeMatch = xmlContent.match(/<chNFe>(\d{44})<\/chNFe>/);
  if (chNFeMatch) {
    return chNFeMatch[1];
  }

  return null;
}
```

### 1.6 Module

```typescript
// src/modules/nf-receiver/nf-receiver.module.ts
import { Module } from '@nestjs/common';
import { NfReceiverService } from './nf-receiver.service';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  providers: [NfReceiverService],
  exports: [NfReceiverService],
})
export class NfReceiverModule {}
```

---

## 2. XML Processor Module

### 2.1 Responsabilidades

- Consumir evento `nf.received`.
- Validar XML contra XSD oficial da NF-e (versão 4.00).
- Extrair todos os metadados do XML (emitente, destinatário, itens, valores, impostos).
- Armazenar XML original no S3.
- Publicar evento `nf.processed`.

### 2.2 Service

```typescript
// src/modules/xml-processor/xml-processor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as libxmljs from 'libxmljs2';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '../persistence/repositories/nf-processing-log.repository';
import { ROUTING_KEYS } from '../../common/constants/queues.constants';
import { NonRetryableException } from '../../common/exceptions/non-retryable.exception';
import { RetryableException } from '../../common/exceptions/retryable.exception';

interface ExtractedNfData {
  numero: number;
  serie: number;
  modelo: string;
  dataEmissao: string;
  dataEntradaSaida?: string;
  naturezaOperacao: string;
  tipoOperacao: number;
  cnpjEmitente: string;
  razaoSocialEmitente: string;
  cnpjDestinatario?: string;
  razaoSocialDestinatario?: string;
  valorTotalProdutos: number;
  valorTotalNf: number;
  valorDesconto: number;
  valorFrete: number;
  valorIcms: number;
  valorIpi: number;
  valorPis: number;
  valorCofins: number;
  protocoloAutorizacao?: string;
  dataAutorizacao?: string;
  quantidadeItens: number;
  emitente: Record<string, any>;
  destinatario: Record<string, any>;
  itens: Record<string, any>[];
  transporte: Record<string, any>;
  pagamentos: Record<string, any>[];
  informacoesComplementares?: string;
}

@Injectable()
export class XmlProcessorService {
  private readonly logger = new Logger(XmlProcessorService.name);
  private xsdDoc: libxmljs.Document | null = null;

  constructor(
    private readonly s3Service: S3Service,
    private readonly rabbitMQService: RabbitMQService,
    private readonly processingLogRepo: NfProcessingLogRepository,
  ) {
    this.loadXsd();
  }

  private loadXsd(): void {
    try {
      const xsdPath = path.join(__dirname, 'xsd', 'nfe_v4.00.xsd');
      if (fs.existsSync(xsdPath)) {
        const xsdContent = fs.readFileSync(xsdPath, 'utf-8');
        this.xsdDoc = libxmljs.parseXml(xsdContent);
        this.logger.log('XSD schema loaded successfully');
      } else {
        this.logger.warn('XSD file not found. XML validation against schema will be skipped.');
      }
    } catch (error) {
      this.logger.error('Failed to load XSD schema', (error as Error).message);
    }
  }

  async process(event: {
    eventId: string;
    chaveAcesso: string;
    xmlContent: string;
    idempotencyKey: string;
    source: string;
    traceId?: string;
    attemptNumber: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const startTime = Date.now();
    const { chaveAcesso, xmlContent, idempotencyKey, traceId, attemptNumber } = event;

    this.logger.log(`Processing XML: chaveAcesso=${chaveAcesso}, attempt=${attemptNumber}`);

    try {
      // 1. Parse XML
      let xmlDoc: libxmljs.Document;
      try {
        xmlDoc = libxmljs.parseXml(xmlContent);
      } catch (parseError) {
        throw new NonRetryableException(
          `XML parsing failed: ${(parseError as Error).message}`,
          'XML_PARSE_ERROR',
        );
      }

      // 2. Validar contra XSD (se disponível)
      if (this.xsdDoc) {
        const isValid = xmlDoc.validate(this.xsdDoc);
        if (!isValid) {
          const errors = xmlDoc.validationErrors
            .map((e) => e.message)
            .join('; ');
          throw new NonRetryableException(
            `XML XSD validation failed: ${errors}`,
            'XML_XSD_VALIDATION_ERROR',
          );
        }
      }

      // 3. Extrair metadados do XML
      const extractedData = this.extractMetadata(xmlDoc, xmlContent);

      // 4. Upload XML para S3
      const s3Key = `nfe/${new Date().getFullYear()}/${chaveAcesso}.xml`;
      try {
        await this.s3Service.upload(s3Key, xmlContent, 'application/xml');
      } catch (s3Error) {
        throw new RetryableException(
          `S3 upload failed: ${(s3Error as Error).message}`,
          s3Error as Error,
        );
      }

      // 5. Publicar evento nf.processed
      await this.rabbitMQService.publish({
        routingKey: ROUTING_KEYS.NF_PROCESSED,
        message: {
          eventId: uuidv4(),
          timestamp: new Date().toISOString(),
          chaveAcesso,
          idempotencyKey,
          notaFiscalId: event.eventId, // será usado como referência
          xmlS3Key: s3Key,
          traceId,
          attemptNumber,
          extractedData,
        },
      });

      // 6. Log sucesso
      const durationMs = Date.now() - startTime;
      await this.processingLogRepo.logProcessingStep({
        chaveAcesso,
        stage: 'XML_PROCESS',
        status: 'SUCCESS',
        durationMs,
        attemptNumber,
        traceId,
      });

      this.logger.log(`XML processed: chaveAcesso=${chaveAcesso}, duration=${durationMs}ms`);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.processingLogRepo.logProcessingStep({
        chaveAcesso,
        stage: 'XML_PROCESS',
        status: 'ERROR',
        errorCode: (error as any).errorCode || 'UNKNOWN',
        errorMessage: (error as Error).message,
        durationMs,
        attemptNumber,
        traceId,
      });
      throw error; // Re-throw para que o consumer lide com retry/DLQ
    }
  }

  private extractMetadata(xmlDoc: libxmljs.Document, rawXml: string): ExtractedNfData {
    const ns = { nfe: 'http://www.portalfiscal.inf.br/nfe' };

    const getText = (xpath: string): string => {
      const node = xmlDoc.get(xpath, ns);
      return node ? (node as any).text() : '';
    };

    const getNumber = (xpath: string): number => {
      const text = getText(xpath);
      return text ? parseFloat(text) : 0;
    };

    // Dados da NF
    const numero = parseInt(getText('//nfe:ide/nfe:nNF'), 10);
    const serie = parseInt(getText('//nfe:ide/nfe:serie'), 10);
    const modelo = getText('//nfe:ide/nfe:mod') || '55';
    const dataEmissao = getText('//nfe:ide/nfe:dhEmi');
    const dataEntradaSaida = getText('//nfe:ide/nfe:dhSaiEnt') || undefined;
    const naturezaOperacao = getText('//nfe:ide/nfe:natOp');
    const tipoOperacao = parseInt(getText('//nfe:ide/nfe:tpNF'), 10);

    // Totais
    const valorTotalProdutos = getNumber('//nfe:total/nfe:ICMSTot/nfe:vProd');
    const valorTotalNf = getNumber('//nfe:total/nfe:ICMSTot/nfe:vNF');
    const valorDesconto = getNumber('//nfe:total/nfe:ICMSTot/nfe:vDesc');
    const valorFrete = getNumber('//nfe:total/nfe:ICMSTot/nfe:vFrete');
    const valorIcms = getNumber('//nfe:total/nfe:ICMSTot/nfe:vICMS');
    const valorIpi = getNumber('//nfe:total/nfe:ICMSTot/nfe:vIPI');
    const valorPis = getNumber('//nfe:total/nfe:ICMSTot/nfe:vPIS');
    const valorCofins = getNumber('//nfe:total/nfe:ICMSTot/nfe:vCOFINS');

    // Emitente
    const emitente = {
      cnpj: getText('//nfe:emit/nfe:CNPJ'),
      razaoSocial: getText('//nfe:emit/nfe:xNome'),
      nomeFantasia: getText('//nfe:emit/nfe:xFant') || null,
      inscricaoEstadual: getText('//nfe:emit/nfe:IE') || null,
      crt: parseInt(getText('//nfe:emit/nfe:CRT'), 10) || null,
      logradouro: getText('//nfe:emit/nfe:enderEmit/nfe:xLgr') || null,
      numero: getText('//nfe:emit/nfe:enderEmit/nfe:nro') || null,
      bairro: getText('//nfe:emit/nfe:enderEmit/nfe:xBairro') || null,
      codigoMunicipio: getText('//nfe:emit/nfe:enderEmit/nfe:cMun') || null,
      nomeMunicipio: getText('//nfe:emit/nfe:enderEmit/nfe:xMun') || null,
      uf: getText('//nfe:emit/nfe:enderEmit/nfe:UF') || null,
      cep: getText('//nfe:emit/nfe:enderEmit/nfe:CEP') || null,
      telefone: getText('//nfe:emit/nfe:enderEmit/nfe:fone') || null,
    };

    // Destinatário
    const destinatario = {
      cnpj: getText('//nfe:dest/nfe:CNPJ') || null,
      cpf: getText('//nfe:dest/nfe:CPF') || null,
      razaoSocial: getText('//nfe:dest/nfe:xNome'),
      inscricaoEstadual: getText('//nfe:dest/nfe:IE') || null,
      email: getText('//nfe:dest/nfe:email') || null,
      logradouro: getText('//nfe:dest/nfe:enderDest/nfe:xLgr') || null,
      numero: getText('//nfe:dest/nfe:enderDest/nfe:nro') || null,
      bairro: getText('//nfe:dest/nfe:enderDest/nfe:xBairro') || null,
      codigoMunicipio: getText('//nfe:dest/nfe:enderDest/nfe:cMun') || null,
      nomeMunicipio: getText('//nfe:dest/nfe:enderDest/nfe:xMun') || null,
      uf: getText('//nfe:dest/nfe:enderDest/nfe:UF') || null,
      cep: getText('//nfe:dest/nfe:enderDest/nfe:CEP') || null,
      indicadorIe: parseInt(getText('//nfe:dest/nfe:indIEDest'), 10) || null,
    };

    // Itens
    const itemNodes = xmlDoc.find('//nfe:det', ns) as libxmljs.Element[];
    const itens = itemNodes.map((itemNode) => {
      const getItemText = (tag: string): string => {
        const n = itemNode.get(`.//nfe:${tag}`, ns);
        return n ? (n as any).text() : '';
      };
      const getItemNumber = (tag: string): number => {
        const t = getItemText(tag);
        return t ? parseFloat(t) : 0;
      };

      return {
        numeroItem: parseInt(itemNode.attr('nItem')?.value() || '0', 10),
        codigoProduto: getItemText('prod/nfe:cProd'),
        ean: getItemText('prod/nfe:cEAN') || null,
        descricao: getItemText('prod/nfe:xProd'),
        ncm: getItemText('prod/nfe:NCM'),
        cfop: getItemText('prod/nfe:CFOP'),
        unidadeComercial: getItemText('prod/nfe:uCom'),
        quantidade: getItemNumber('prod/nfe:qCom'),
        valorUnitario: getItemNumber('prod/nfe:vUnCom'),
        valorTotal: getItemNumber('prod/nfe:vProd'),
        valorDesconto: getItemNumber('prod/nfe:vDesc'),
      };
    });

    // Protocolo de autorização
    const protocoloAutorizacao = getText('//nfe:protNFe/nfe:infProt/nfe:nProt') || undefined;
    const dataAutorizacao = getText('//nfe:protNFe/nfe:infProt/nfe:dhRecbto') || undefined;

    // Transporte
    const transporte = {
      modalidadeFrete: parseInt(getText('//nfe:transp/nfe:modFrete'), 10) || 9,
    };

    // Pagamentos
    const pagNodes = xmlDoc.find('//nfe:pag/nfe:detPag', ns) as libxmljs.Element[];
    const pagamentos = pagNodes.map((pagNode) => {
      const getPagText = (tag: string): string => {
        const n = pagNode.get(`.//nfe:${tag}`, ns);
        return n ? (n as any).text() : '';
      };
      return {
        formaPagamento: getPagText('tPag'),
        valor: parseFloat(getPagText('vPag')) || 0,
      };
    });

    return {
      numero,
      serie,
      modelo,
      dataEmissao,
      dataEntradaSaida,
      naturezaOperacao,
      tipoOperacao,
      cnpjEmitente: emitente.cnpj,
      razaoSocialEmitente: emitente.razaoSocial,
      cnpjDestinatario: destinatario.cnpj || undefined,
      razaoSocialDestinatario: destinatario.razaoSocial || undefined,
      valorTotalProdutos,
      valorTotalNf,
      valorDesconto,
      valorFrete,
      valorIcms,
      valorIpi,
      valorPis,
      valorCofins,
      protocoloAutorizacao,
      dataAutorizacao,
      quantidadeItens: itens.length,
      emitente,
      destinatario,
      itens,
      transporte,
      pagamentos,
      informacoesComplementares: getText('//nfe:infAdic/nfe:infCpl') || undefined,
    };
  }
}
```

### 2.3 Consumer

```typescript
// src/modules/xml-processor/xml-processor.consumer.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { XmlProcessorService } from './xml-processor.service';
import { QUEUES, PREFETCH_COUNTS } from '../../common/constants/queues.constants';

@Injectable()
export class XmlProcessorConsumer implements OnModuleInit {
  private readonly logger = new Logger(XmlProcessorConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly xmlProcessorService: XmlProcessorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMQService.consume({
      queue: QUEUES.XML_PROCESSOR,
      prefetch: PREFETCH_COUNTS.XML_PROCESSOR,
      handler: async (_msg, content) => {
        this.logger.log(`Consuming nf.received: chaveAcesso=${content.chaveAcesso}`);
        await this.xmlProcessorService.process(content);
      },
    });

    this.logger.log('XmlProcessorConsumer started');
  }
}
```

---

## 3. Business Validator Module

### 3.1 Responsabilidades

- Consumir evento `nf.processed`.
- Validar CNPJ do emitente na Receita Federal (via ReceitaWS).
- Validar chave de acesso na SEFAZ.
- Implementar circuit breaker para APIs externas.
- Publicar evento `nf.validated`.

### 3.2 Service

```typescript
// src/modules/business-validator/business-validator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SefazClient } from './clients/sefaz.client';
import { ReceitaWsClient } from './clients/receita-ws.client';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '../persistence/repositories/nf-processing-log.repository';
import { ROUTING_KEYS } from '../../common/constants/queues.constants';
import { NonRetryableException } from '../../common/exceptions/non-retryable.exception';
import { RetryableException } from '../../common/exceptions/retryable.exception';

interface ValidationResult {
  cnpjEmitenteValid: boolean;
  cnpjEmitenteStatus: string;
  cnpjDestinatarioValid: boolean;
  sefazStatus: string;
  sefazProtocolo: string;
  allValidationsPassed: boolean;
  validationErrors: { code: string; message: string; field: string }[];
}

@Injectable()
export class BusinessValidatorService {
  private readonly logger = new Logger(BusinessValidatorService.name);

  constructor(
    private readonly sefazClient: SefazClient,
    private readonly receitaWsClient: ReceitaWsClient,
    private readonly rabbitMQService: RabbitMQService,
    private readonly processingLogRepo: NfProcessingLogRepository,
  ) {}

  async validate(event: {
    eventId: string;
    chaveAcesso: string;
    idempotencyKey: string;
    notaFiscalId: string;
    xmlS3Key: string;
    traceId?: string;
    attemptNumber: number;
    extractedData: Record<string, any>;
  }): Promise<void> {
    const startTime = Date.now();
    const { chaveAcesso, extractedData, traceId, attemptNumber } = event;
    const validationErrors: { code: string; message: string; field: string }[] = [];

    this.logger.log(`Validating business rules: chaveAcesso=${chaveAcesso}`);

    try {
      // 1. Validar CNPJ do emitente
      let cnpjEmitenteValid = false;
      let cnpjEmitenteStatus = 'NOT_CHECKED';

      try {
        const cnpjResult = await this.receitaWsClient.consultarCnpj(extractedData.cnpjEmitente);
        cnpjEmitenteValid = cnpjResult.situacao === 'ATIVA';
        cnpjEmitenteStatus = cnpjResult.situacao;

        if (!cnpjEmitenteValid) {
          validationErrors.push({
            code: 'CNPJ_EMITENTE_INATIVO',
            message: `CNPJ do emitente não está ativo: ${cnpjEmitenteStatus}`,
            field: 'cnpjEmitente',
          });
        }
      } catch (error) {
        if ((error as any).isCircuitBreakerOpen) {
          throw new RetryableException('ReceitaWS circuit breaker is open');
        }
        this.logger.warn(`ReceitaWS consultation failed, continuing: ${(error as Error).message}`);
        cnpjEmitenteStatus = 'CONSULTATION_FAILED';
      }

      // 2. Validar CNPJ do destinatário (se presente)
      let cnpjDestinatarioValid = true;
      if (extractedData.cnpjDestinatario) {
        try {
          const destResult = await this.receitaWsClient.consultarCnpj(extractedData.cnpjDestinatario);
          cnpjDestinatarioValid = destResult.situacao === 'ATIVA';
          if (!cnpjDestinatarioValid) {
            validationErrors.push({
              code: 'CNPJ_DESTINATARIO_INATIVO',
              message: `CNPJ do destinatário não está ativo`,
              field: 'cnpjDestinatario',
            });
          }
        } catch {
          // Não bloqueia por falha na consulta do destinatário
          this.logger.warn('Consulta CNPJ destinatário falhou, continuando...');
        }
      }

      // 3. Validar na SEFAZ
      let sefazStatus = 'NOT_CHECKED';
      let sefazProtocolo = '';

      try {
        const sefazResult = await this.sefazClient.consultarNfe(chaveAcesso);
        sefazStatus = sefazResult.status;
        sefazProtocolo = sefazResult.protocolo || '';

        if (sefazResult.status !== 'AUTORIZADA') {
          validationErrors.push({
            code: 'SEFAZ_NF_NAO_AUTORIZADA',
            message: `NF não está autorizada na SEFAZ: ${sefazStatus}`,
            field: 'chaveAcesso',
          });
        }
      } catch (error) {
        if ((error as any).isCircuitBreakerOpen) {
          throw new RetryableException('SEFAZ circuit breaker is open');
        }
        this.logger.warn(`SEFAZ consultation failed: ${(error as Error).message}`);
        sefazStatus = 'CONSULTATION_FAILED';
      }

      // 4. Consolidar resultado
      const allValidationsPassed = validationErrors.length === 0;

      const validationResults: ValidationResult = {
        cnpjEmitenteValid,
        cnpjEmitenteStatus,
        cnpjDestinatarioValid,
        sefazStatus,
        sefazProtocolo,
        allValidationsPassed,
        validationErrors,
      };

      // 5. Publicar evento nf.validated
      await this.rabbitMQService.publish({
        routingKey: ROUTING_KEYS.NF_VALIDATED,
        message: {
          eventId: uuidv4(),
          timestamp: new Date().toISOString(),
          chaveAcesso,
          idempotencyKey: event.idempotencyKey,
          notaFiscalId: event.notaFiscalId,
          xmlS3Key: event.xmlS3Key,
          traceId,
          attemptNumber,
          validationResults,
          fullNfData: extractedData,
        },
      });

      // 6. Log
      const durationMs = Date.now() - startTime;
      await this.processingLogRepo.logProcessingStep({
        chaveAcesso,
        stage: 'BUSINESS_VALIDATE',
        status: allValidationsPassed ? 'SUCCESS' : 'WARNING',
        durationMs,
        attemptNumber,
        traceId,
        metadata: { validationResults },
      });

      this.logger.log(
        `Business validation complete: chaveAcesso=${chaveAcesso}, passed=${allValidationsPassed}, duration=${durationMs}ms`,
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.processingLogRepo.logProcessingStep({
        chaveAcesso,
        stage: 'BUSINESS_VALIDATE',
        status: 'ERROR',
        errorMessage: (error as Error).message,
        durationMs,
        attemptNumber,
        traceId,
      });
      throw error;
    }
  }
}
```

### 3.3 Clients HTTP

```typescript
// src/modules/business-validator/clients/receita-ws.client.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import CircuitBreaker from 'opossum';

interface CnpjConsultaResult {
  cnpj: string;
  situacao: string; // ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA
  razaoSocial: string;
  dataAbertura: string;
}

@Injectable()
export class ReceitaWsClient {
  private readonly logger = new Logger(ReceitaWsClient.name);
  private readonly breaker: CircuitBreaker;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('RECEITA_WS_URL', 'https://receitaws.com.br/v1');
    this.timeoutMs = this.configService.get<number>('RECEITA_WS_TIMEOUT_MS', 10000);

    this.breaker = new CircuitBreaker(this.doConsultarCnpj.bind(this), {
      timeout: this.timeoutMs,
      errorThresholdPercentage: 50,
      resetTimeout: 30000, // 30s para half-open
      volumeThreshold: 5,
      name: 'ReceitaWS',
    });

    this.breaker.on('open', () => this.logger.warn('Circuit breaker OPEN for ReceitaWS'));
    this.breaker.on('halfOpen', () => this.logger.log('Circuit breaker HALF-OPEN for ReceitaWS'));
    this.breaker.on('close', () => this.logger.log('Circuit breaker CLOSED for ReceitaWS'));
  }

  async consultarCnpj(cnpj: string): Promise<CnpjConsultaResult> {
    try {
      return await this.breaker.fire(cnpj) as CnpjConsultaResult;
    } catch (error) {
      if ((error as any).code === 'EOPENBREAKER') {
        const retryError = new Error('ReceitaWS circuit breaker is open');
        (retryError as any).isCircuitBreakerOpen = true;
        throw retryError;
      }
      throw error;
    }
  }

  private async doConsultarCnpj(cnpj: string): Promise<CnpjConsultaResult> {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    const url = `${this.baseUrl}/cnpj/${cleanCnpj}`;

    const response = await firstValueFrom(
      this.httpService.get(url, {
        timeout: this.timeoutMs,
        headers: { Accept: 'application/json' },
      }).pipe(
        timeout(this.timeoutMs),
        catchError((err) => {
          this.logger.error(`ReceitaWS request failed: ${err.message}`);
          throw err;
        }),
      ),
    );

    return {
      cnpj: response.data.cnpj,
      situacao: response.data.situacao,
      razaoSocial: response.data.nome,
      dataAbertura: response.data.abertura,
    };
  }
}
```

```typescript
// src/modules/business-validator/clients/sefaz.client.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import CircuitBreaker from 'opossum';

interface SefazConsultaResult {
  status: string; // AUTORIZADA, CANCELADA, DENEGADA, etc.
  protocolo?: string;
  dataAutorizacao?: string;
}

@Injectable()
export class SefazClient {
  private readonly logger = new Logger(SefazClient.name);
  private readonly breaker: CircuitBreaker;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('SEFAZ_API_URL');
    this.timeoutMs = this.configService.get<number>('SEFAZ_TIMEOUT_MS', 10000);

    this.breaker = new CircuitBreaker(this.doConsultarNfe.bind(this), {
      timeout: this.timeoutMs,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 5,
      name: 'SEFAZ',
    });

    this.breaker.on('open', () => this.logger.warn('Circuit breaker OPEN for SEFAZ'));
    this.breaker.on('halfOpen', () => this.logger.log('Circuit breaker HALF-OPEN for SEFAZ'));
    this.breaker.on('close', () => this.logger.log('Circuit breaker CLOSED for SEFAZ'));
  }

  async consultarNfe(chaveAcesso: string): Promise<SefazConsultaResult> {
    try {
      return await this.breaker.fire(chaveAcesso) as SefazConsultaResult;
    } catch (error) {
      if ((error as any).code === 'EOPENBREAKER') {
        const retryError = new Error('SEFAZ circuit breaker is open');
        (retryError as any).isCircuitBreakerOpen = true;
        throw retryError;
      }
      throw error;
    }
  }

  private async doConsultarNfe(chaveAcesso: string): Promise<SefazConsultaResult> {
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/nfe/${chaveAcesso}`, {
        timeout: this.timeoutMs,
        headers: {
          Authorization: `Bearer ${this.configService.get('SEFAZ_API_TOKEN')}`,
        },
      }).pipe(
        timeout(this.timeoutMs),
        catchError((err) => {
          this.logger.error(`SEFAZ request failed: ${err.message}`);
          throw err;
        }),
      ),
    );

    return {
      status: response.data.status,
      protocolo: response.data.protocolo,
      dataAutorizacao: response.data.dataAutorizacao,
    };
  }
}
```

### 3.4 Consumer

```typescript
// src/modules/business-validator/business-validator.consumer.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { BusinessValidatorService } from './business-validator.service';
import { QUEUES, PREFETCH_COUNTS } from '../../common/constants/queues.constants';

@Injectable()
export class BusinessValidatorConsumer implements OnModuleInit {
  private readonly logger = new Logger(BusinessValidatorConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly businessValidatorService: BusinessValidatorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMQService.consume({
      queue: QUEUES.BUSINESS_VALIDATOR,
      prefetch: PREFETCH_COUNTS.BUSINESS_VALIDATOR,
      handler: async (_msg, content) => {
        this.logger.log(`Consuming nf.processed: chaveAcesso=${content.chaveAcesso}`);
        await this.businessValidatorService.validate(content);
      },
    });
    this.logger.log('BusinessValidatorConsumer started');
  }
}
```

### 3.5 Module

```typescript
// src/modules/business-validator/business-validator.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BusinessValidatorService } from './business-validator.service';
import { BusinessValidatorConsumer } from './business-validator.consumer';
import { SefazClient } from './clients/sefaz.client';
import { ReceitaWsClient } from './clients/receita-ws.client';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [HttpModule, PersistenceModule],
  providers: [
    BusinessValidatorService,
    BusinessValidatorConsumer,
    SefazClient,
    ReceitaWsClient,
  ],
  exports: [BusinessValidatorService],
})
export class BusinessValidatorModule {}
```

---

## 4. Persistence Module

### 4.1 Service

```typescript
// src/modules/persistence/persistence.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NotaFiscalRepository } from './repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from './repositories/nf-processing-log.repository';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NfItem } from './entities/nf-item.entity';
import { NfEmitente } from './entities/nf-emitente.entity';
import { NfDestinatario } from './entities/nf-destinatario.entity';
import { NfTransporte } from './entities/nf-transporte.entity';
import { NfPagamento } from './entities/nf-pagamento.entity';
import { NfStatus } from '../../common/enums/nf-status.enum';
import { NfSource } from '../../common/enums/nf-source.enum';
import { ROUTING_KEYS } from '../../common/constants/queues.constants';
import { RetryableException } from '../../common/exceptions/retryable.exception';

@Injectable()
export class PersistenceService {
  private readonly logger = new Logger(PersistenceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly nfRepository: NotaFiscalRepository,
    private readonly processingLogRepo: NfProcessingLogRepository,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async persist(event: {
    eventId: string;
    chaveAcesso: string;
    idempotencyKey: string;
    notaFiscalId: string;
    xmlS3Key: string;
    traceId?: string;
    attemptNumber: number;
    validationResults: Record<string, any>;
    fullNfData: Record<string, any>;
  }): Promise<void> {
    const startTime = Date.now();
    const { chaveAcesso, idempotencyKey, xmlS3Key, fullNfData, traceId, attemptNumber, validationResults } = event;

    this.logger.log(`Persisting NF: chaveAcesso=${chaveAcesso}`);

    // Verificar se já foi persistida (idempotência em nível de banco)
    const existing = await this.nfRepository.findByChaveAcesso(chaveAcesso);
    if (existing && existing.status === NfStatus.COMPLETED) {
      this.logger.log(`NF already persisted: chaveAcesso=${chaveAcesso}`);
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Criar ou atualizar NotaFiscal
      const nf = new NotaFiscal();
      nf.chaveAcesso = chaveAcesso;
      nf.idempotencyKey = idempotencyKey;
      nf.numero = fullNfData.numero;
      nf.serie = fullNfData.serie;
      nf.modelo = fullNfData.modelo || '55';
      nf.dataEmissao = new Date(fullNfData.dataEmissao);
      nf.dataEntradaSaida = fullNfData.dataEntradaSaida ? new Date(fullNfData.dataEntradaSaida) : null;
      nf.naturezaOperacao = fullNfData.naturezaOperacao;
      nf.tipoOperacao = fullNfData.tipoOperacao;
      nf.valorTotalProdutos = fullNfData.valorTotalProdutos;
      nf.valorTotalNf = fullNfData.valorTotalNf;
      nf.valorDesconto = fullNfData.valorDesconto;
      nf.valorFrete = fullNfData.valorFrete;
      nf.valorIcms = fullNfData.valorIcms;
      nf.valorIpi = fullNfData.valorIpi;
      nf.valorPis = fullNfData.valorPis;
      nf.valorCofins = fullNfData.valorCofins;
      nf.informacoesComplementares = fullNfData.informacoesComplementares || null;
      nf.status = validationResults.allValidationsPassed ? NfStatus.COMPLETED : NfStatus.BUSINESS_ERROR;
      nf.source = NfSource.API; // será sobrescrito pelo source real
      nf.xmlS3Key = xmlS3Key;
      nf.protocoloAutorizacao = fullNfData.protocoloAutorizacao || null;
      nf.dataAutorizacao = fullNfData.dataAutorizacao ? new Date(fullNfData.dataAutorizacao) : null;
      nf.processedAt = new Date();
      nf.metadata = { validationResults };

      const savedNf = await queryRunner.manager.save(NotaFiscal, nf);

      // 2. Salvar emitente
      if (fullNfData.emitente) {
        const emitente = new NfEmitente();
        Object.assign(emitente, fullNfData.emitente);
        emitente.notaFiscalId = savedNf.id;
        await queryRunner.manager.save(NfEmitente, emitente);
      }

      // 3. Salvar destinatário
      if (fullNfData.destinatario) {
        const dest = new NfDestinatario();
        Object.assign(dest, fullNfData.destinatario);
        dest.notaFiscalId = savedNf.id;
        await queryRunner.manager.save(NfDestinatario, dest);
      }

      // 4. Salvar itens
      if (fullNfData.itens && fullNfData.itens.length > 0) {
        const itens = fullNfData.itens.map((itemData: any) => {
          const item = new NfItem();
          Object.assign(item, itemData);
          item.notaFiscalId = savedNf.id;
          return item;
        });
        await queryRunner.manager.save(NfItem, itens);
      }

      // 5. Salvar transporte
      if (fullNfData.transporte) {
        const transporte = new NfTransporte();
        Object.assign(transporte, fullNfData.transporte);
        transporte.notaFiscalId = savedNf.id;
        await queryRunner.manager.save(NfTransporte, transporte);
      }

      // 6. Salvar pagamentos
      if (fullNfData.pagamentos && fullNfData.pagamentos.length > 0) {
        const pagamentos = fullNfData.pagamentos.map((pagData: any) => {
          const pag = new NfPagamento();
          Object.assign(pag, pagData);
          pag.notaFiscalId = savedNf.id;
          return pag;
        });
        await queryRunner.manager.save(NfPagamento, pagamentos);
      }

      await queryRunner.commitTransaction();

      // 7. Publicar evento nf.persisted
      await this.rabbitMQService.publish({
        routingKey: ROUTING_KEYS.NF_PERSISTED,
        message: {
          eventId: uuidv4(),
          timestamp: new Date().toISOString(),
          chaveAcesso,
          notaFiscalId: savedNf.id,
          status: savedNf.status,
          traceId,
          summary: {
            numero: savedNf.numero,
            serie: savedNf.serie,
            cnpjEmitente: fullNfData.cnpjEmitente,
            valorTotal: savedNf.valorTotalNf,
            quantidadeItens: fullNfData.itens?.length || 0,
          },
        },
      });

      const durationMs = Date.now() - startTime;
      await this.processingLogRepo.logProcessingStep({
        notaFiscalId: savedNf.id,
        chaveAcesso,
        stage: 'PERSIST',
        status: 'SUCCESS',
        durationMs,
        attemptNumber,
        traceId,
      });

      this.logger.log(`NF persisted: id=${savedNf.id}, chaveAcesso=${chaveAcesso}, duration=${durationMs}ms`);
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const durationMs = Date.now() - startTime;
      await this.processingLogRepo.logProcessingStep({
        chaveAcesso,
        stage: 'PERSIST',
        status: 'ERROR',
        errorMessage: (error as Error).message,
        durationMs,
        attemptNumber,
        traceId,
      });

      // Erros de DB são geralmente transientes
      throw new RetryableException(`Persistence failed: ${(error as Error).message}`, error as Error);
    } finally {
      await queryRunner.release();
    }
  }
}
```

### 4.2 Consumer

```typescript
// src/modules/persistence/persistence.consumer.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { PersistenceService } from './persistence.service';
import { QUEUES, PREFETCH_COUNTS } from '../../common/constants/queues.constants';

@Injectable()
export class PersistenceConsumer implements OnModuleInit {
  private readonly logger = new Logger(PersistenceConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly persistenceService: PersistenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMQService.consume({
      queue: QUEUES.PERSISTENCE,
      prefetch: PREFETCH_COUNTS.PERSISTENCE,
      handler: async (_msg, content) => {
        this.logger.log(`Consuming nf.validated: chaveAcesso=${content.chaveAcesso}`);
        await this.persistenceService.persist(content);
      },
    });
    this.logger.log('PersistenceConsumer started');
  }
}
```

### 4.3 Module

```typescript
// src/modules/persistence/persistence.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersistenceService } from './persistence.service';
import { PersistenceConsumer } from './persistence.consumer';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NfItem } from './entities/nf-item.entity';
import { NfEmitente } from './entities/nf-emitente.entity';
import { NfDestinatario } from './entities/nf-destinatario.entity';
import { NfTransporte } from './entities/nf-transporte.entity';
import { NfPagamento } from './entities/nf-pagamento.entity';
import { NfProcessingLog } from './entities/nf-processing-log.entity';
import { NotaFiscalRepository } from './repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from './repositories/nf-processing-log.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotaFiscal,
      NfItem,
      NfEmitente,
      NfDestinatario,
      NfTransporte,
      NfPagamento,
      NfProcessingLog,
    ]),
  ],
  providers: [
    PersistenceService,
    PersistenceConsumer,
    NotaFiscalRepository,
    NfProcessingLogRepository,
  ],
  exports: [
    PersistenceService,
    NotaFiscalRepository,
    NfProcessingLogRepository,
  ],
})
export class PersistenceModule {}
```

---

## 5. API Gateway Module

### 5.1 Controller Principal

```typescript
// src/modules/api-gateway/controllers/nf.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NfReceiverService } from '../../nf-receiver/nf-receiver.service';
import { NotaFiscalRepository } from '../../persistence/repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from '../../persistence/repositories/nf-processing-log.repository';
import { ReceiveNfDto } from '../../nf-receiver/dto/receive-nf.dto';
import { NfStatus } from '../../../common/enums/nf-status.enum';
import { NfSource } from '../../../common/enums/nf-source.enum';

@ApiTags('Notas Fiscais')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/nf')
export class NfController {
  private readonly logger = new Logger(NfController.name);

  constructor(
    private readonly nfReceiverService: NfReceiverService,
    private readonly nfRepository: NotaFiscalRepository,
    private readonly processingLogRepo: NfProcessingLogRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submeter NF-e para processamento' })
  @ApiResponse({ status: 202, description: 'NF-e aceita para processamento' })
  @ApiResponse({ status: 200, description: 'NF-e já processada anteriormente (idempotente)' })
  @ApiResponse({ status: 400, description: 'XML inválido ou campos obrigatórios ausentes' })
  @ApiResponse({ status: 401, description: 'Token JWT inválido ou ausente' })
  async submitNf(@Body() dto: ReceiveNfDto) {
    const result = await this.nfReceiverService.receive(dto);

    if (result.alreadyProcessed) {
      return {
        statusCode: 200,
        message: 'NF-e já foi recebida anteriormente',
        data: result,
      };
    }

    return {
      statusCode: 202,
      message: 'NF-e aceita para processamento',
      data: result,
    };
  }

  @Get(':chaveAcesso')
  @ApiOperation({ summary: 'Consultar NF-e por chave de acesso' })
  @ApiResponse({ status: 200, description: 'NF-e encontrada' })
  @ApiResponse({ status: 404, description: 'NF-e não encontrada' })
  async getNfByChaveAcesso(@Param('chaveAcesso') chaveAcesso: string) {
    const nf = await this.nfRepository.findByChaveAcesso(chaveAcesso);
    if (!nf) {
      return { statusCode: 404, message: 'NF-e não encontrada' };
    }
    return { statusCode: 200, data: nf };
  }

  @Get()
  @ApiOperation({ summary: 'Listar NF-es com filtros' })
  @ApiQuery({ name: 'status', enum: NfStatus, required: false })
  @ApiQuery({ name: 'source', enum: NfSource, required: false })
  @ApiQuery({ name: 'dataInicio', type: String, required: false })
  @ApiQuery({ name: 'dataFim', type: String, required: false })
  @ApiQuery({ name: 'cnpjEmitente', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async listNfs(
    @Query('status') status?: NfStatus,
    @Query('source') source?: NfSource,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('cnpjEmitente') cnpjEmitente?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.nfRepository.findWithFilters({
      status,
      source,
      dataEmissaoInicio: dataInicio ? new Date(dataInicio) : undefined,
      dataEmissaoFim: dataFim ? new Date(dataFim) : undefined,
      cnpjEmitente,
      page: page || 1,
      limit: Math.min(limit || 20, 100),
    });

    return {
      statusCode: 200,
      data: result.data,
      pagination: {
        total: result.total,
        page: page || 1,
        limit: limit || 20,
        totalPages: Math.ceil(result.total / (limit || 20)),
      },
    };
  }

  @Get(':chaveAcesso/logs')
  @ApiOperation({ summary: 'Consultar logs de processamento de uma NF-e' })
  async getNfLogs(@Param('chaveAcesso') chaveAcesso: string) {
    const logs = await this.processingLogRepo.getLogsByChaveAcesso(chaveAcesso);
    return { statusCode: 200, data: logs };
  }

  @Get('summary/status')
  @ApiOperation({ summary: 'Resumo de NF-es por status' })
  async getStatusSummary() {
    const summary = await this.nfRepository.getStatusSummary();
    return { statusCode: 200, data: summary };
  }
}
```

### 5.2 Health Controller

```typescript
// src/modules/api-gateway/controllers/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RedisService } from '../../../infrastructure/redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly redisService: RedisService) {}

  @Get()
  @ApiOperation({ summary: 'Health check da aplicação' })
  async check() {
    const checks: Record<string, string> = {};

    try {
      await this.redisService.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    return {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  async ready() {
    return { status: 'ready' };
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness check' })
  async live() {
    return { status: 'alive' };
  }
}
```

### 5.3 Module

```typescript
// src/modules/api-gateway/api-gateway.module.ts
import { Module } from '@nestjs/common';
import { NfController } from './controllers/nf.controller';
import { HealthController } from './controllers/health.controller';
import { NfReceiverModule } from '../nf-receiver/nf-receiver.module';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [NfReceiverModule, PersistenceModule],
  controllers: [NfController, HealthController],
})
export class ApiGatewayModule {}
```

---

## 6. Email Consumer Module

### 6.1 Service

```typescript
// src/modules/email-consumer/email-consumer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { NfReceiverService } from '../nf-receiver/nf-receiver.service';
import { NfSource } from '../../common/enums/nf-source.enum';

@Injectable()
export class EmailConsumerService {
  private readonly logger = new Logger(EmailConsumerService.name);
  private readonly imapConfig: Imap.Config;

  constructor(
    private readonly configService: ConfigService,
    private readonly nfReceiverService: NfReceiverService,
  ) {
    this.imapConfig = {
      user: this.configService.getOrThrow<string>('IMAP_USER'),
      password: this.configService.getOrThrow<string>('IMAP_PASSWORD'),
      host: this.configService.getOrThrow<string>('IMAP_HOST'),
      port: this.configService.get<number>('IMAP_PORT', 993),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    };
  }

  async checkEmails(): Promise<void> {
    this.logger.log('Checking emails for NF-e attachments...');

    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err, box) => {
          if (err) { reject(err); return; }

          // Buscar emails não lidos
          imap.search(['UNSEEN'], (searchErr, results) => {
            if (searchErr) { reject(searchErr); return; }
            if (!results || results.length === 0) {
              this.logger.log('No new emails found');
              imap.end();
              resolve();
              return;
            }

            const fetch = imap.fetch(results, { bodies: '', markSeen: true });
            const processPromises: Promise<void>[] = [];

            fetch.on('message', (msg) => {
              let buffer = '';

              msg.on('body', (stream) => {
                stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
                stream.once('end', () => {
                  const p = this.processEmail(buffer);
                  processPromises.push(p);
                });
              });
            });

            fetch.once('end', async () => {
              await Promise.allSettled(processPromises);
              imap.end();
              resolve();
            });
          });
        });
      });

      imap.once('error', (err: Error) => {
        this.logger.error(`IMAP error: ${err.message}`);
        reject(err);
      });

      imap.connect();
    });
  }

  private async processEmail(rawEmail: string): Promise<void> {
    try {
      const parsed: ParsedMail = await simpleParser(rawEmail);

      if (!parsed.attachments || parsed.attachments.length === 0) {
        this.logger.debug(`Email "${parsed.subject}" has no attachments, skipping`);
        return;
      }

      for (const attachment of parsed.attachments) {
        if (
          attachment.filename?.endsWith('.xml') ||
          attachment.contentType === 'application/xml' ||
          attachment.contentType === 'text/xml'
        ) {
          const xmlContent = attachment.content.toString('utf-8');

          this.logger.log(`Processing XML attachment: ${attachment.filename} from ${parsed.from?.text}`);

          await this.nfReceiverService.receive({
            xmlContent,
            source: NfSource.EMAIL,
            metadata: {
              emailFrom: parsed.from?.text,
              emailSubject: parsed.subject,
              emailDate: parsed.date?.toISOString(),
              attachmentFilename: attachment.filename,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process email: ${(error as Error).message}`);
    }
  }
}
```

### 6.2 Scheduler

```typescript
// src/modules/email-consumer/email-consumer.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailConsumerService } from './email-consumer.service';

@Injectable()
export class EmailConsumerScheduler {
  private readonly logger = new Logger(EmailConsumerScheduler.name);
  private isRunning = false;

  constructor(private readonly emailConsumerService: EmailConsumerService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Email check already running, skipping...');
      return;
    }

    this.isRunning = true;
    try {
      await this.emailConsumerService.checkEmails();
    } catch (error) {
      this.logger.error(`Email check failed: ${(error as Error).message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
```

---

## 7. S3 Listener Module

### 7.1 Service

```typescript
// src/modules/s3-listener/s3-listener.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { NfReceiverService } from '../nf-receiver/nf-receiver.service';
import { NfSource } from '../../common/enums/nf-source.enum';

interface S3Event {
  Records: Array<{
    s3: {
      bucket: { name: string };
      object: { key: string; size: number };
    };
  }>;
}

@Injectable()
export class S3ListenerService {
  private readonly logger = new Logger(S3ListenerService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly nfReceiverService: NfReceiverService,
  ) {}

  async handleS3Event(event: S3Event): Promise<void> {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      if (!key.endsWith('.xml')) {
        this.logger.debug(`Skipping non-XML file: ${key}`);
        continue;
      }

      this.logger.log(`Processing S3 file: s3://${bucket}/${key}`);

      try {
        const xmlContent = await this.s3Service.download(key, bucket);

        await this.nfReceiverService.receive({
          xmlContent,
          source: NfSource.S3,
          metadata: {
            s3Bucket: bucket,
            s3Key: key,
            s3Size: record.s3.object.size,
          },
        });

        this.logger.log(`S3 file processed: ${key}`);
      } catch (error) {
        this.logger.error(`Failed to process S3 file ${key}: ${(error as Error).message}`);
      }
    }
  }
}
```

### 7.2 Consumer (SQS → RabbitMQ bridge ou webhook)

```typescript
// src/modules/s3-listener/s3-listener.consumer.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { S3ListenerService } from './s3-listener.service';

@Injectable()
export class S3ListenerConsumer implements OnModuleInit {
  private readonly logger = new Logger(S3ListenerConsumer.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private isListening = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly s3ListenerService: S3ListenerService,
  ) {
    this.sqsClient = new SQSClient({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
    });
    this.queueUrl = this.configService.get<string>('S3_EVENTS_SQS_URL', '');
  }

  async onModuleInit(): Promise<void> {
    if (!this.queueUrl) {
      this.logger.warn('S3_EVENTS_SQS_URL not configured, S3 listener disabled');
      return;
    }
    this.isListening = true;
    this.pollMessages();
  }

  private async pollMessages(): Promise<void> {
    while (this.isListening) {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // Long polling
        });

        const response = await this.sqsClient.send(command);

        if (response.Messages) {
          for (const message of response.Messages) {
            try {
              const body = JSON.parse(message.Body || '{}');
              await this.s3ListenerService.handleS3Event(body);

              // Deletar mensagem do SQS após processamento
              await this.sqsClient.send(
                new DeleteMessageCommand({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle: message.ReceiptHandle,
                }),
              );
            } catch (error) {
              this.logger.error(`Failed to process SQS message: ${(error as Error).message}`);
            }
          }
        }
      } catch (error) {
        this.logger.error(`SQS polling error: ${(error as Error).message}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}
```
