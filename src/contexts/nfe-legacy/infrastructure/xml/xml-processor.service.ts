import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '@infra/s3/s3.service';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '@context/nfe-legacy/domain/repositories/nf-processing-log.repository';
import { NonRetryableException } from '@shared/exceptions/non-retryable.exception';
import { RetryableException } from '@shared/exceptions/retryable.exception';
import { EXCHANGES, ROUTING_KEYS } from '@shared/constants/queues.constants';
import { extractXmlTag } from '@shared/utils/xml.util';
import { NfReceivedEventDto } from '@context/ingestion/application/dto/nf-received-event.dto';
import { XmlMetadataDto } from '@context/nfe-legacy/application/dto/xml-metadata.dto';
import { NfeXsdValidationService } from '@context/nfe-legacy/infrastructure/xml/nfe-xsd-validation.service';

@Injectable()
export class XmlProcessorService {
  private readonly logger = new Logger(XmlProcessorService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly rabbitMQService: RabbitMQService,
    private readonly processingLogRepository: NfProcessingLogRepository,
    private readonly configService: ConfigService,
    private readonly nfeXsdValidationService: NfeXsdValidationService,
  ) {}

  async process(event: NfReceivedEventDto): Promise<void> {
    const startTime = Date.now();

    let xmlContent = event.xmlContent ?? '';
    if (!xmlContent && event.rawStorageKey) {
      try {
        xmlContent = await this.s3Service.download(event.rawStorageKey);
      } catch (error) {
        await this.processingLogRepository.logProcessingStep({
          chaveAcesso: event.chaveAcesso,
          stage: 'XML_PROCESS',
          status: 'ERROR',
          errorCode: 'NF010',
          errorMessage: (error as Error).message,
          durationMs: Date.now() - startTime,
          metadata: { rawStorageKey: event.rawStorageKey },
        });
        throw new RetryableException(`S3 download failed: ${(error as Error).message}`, 'NF010', {
          chaveAcesso: event.chaveAcesso,
          rawStorageKey: event.rawStorageKey,
        });
      }
    }
    if (!xmlContent?.trim()) {
      await this.processingLogRepository.logProcessingStep({
        chaveAcesso: event.chaveAcesso,
        stage: 'XML_PROCESS',
        status: 'ERROR',
        errorCode: 'NF011',
        errorMessage: 'Missing xmlContent and rawStorageKey',
        durationMs: Date.now() - startTime,
      });
      throw new NonRetryableException('Missing XML payload', 'NF011', { chaveAcesso: event.chaveAcesso });
    }

    if (this.configService.get<boolean>('NFE_XSD_ENABLED', false)) {
      this.nfeXsdValidationService.validateOrSkip(xmlContent);
    }

    let metadata: XmlMetadataDto;
    try {
      metadata = this.parseXml(xmlContent);
    } catch (error) {
      await this.processingLogRepository.logProcessingStep({
        chaveAcesso: event.chaveAcesso,
        stage: 'XML_PROCESS',
        status: 'ERROR',
        errorCode: 'NF001',
        errorMessage: (error as Error).message,
        durationMs: Date.now() - startTime,
      });

      throw new NonRetryableException(`XML parsing failed: ${(error as Error).message}`, 'NF001', {
        chaveAcesso: event.chaveAcesso,
      });
    }

    const s3Key =
      event.preUploadedToS3 && event.rawStorageKey ? event.rawStorageKey : this.s3Service.buildNfKey(event.chaveAcesso);
    if (!event.preUploadedToS3 || !event.rawStorageKey) {
      try {
        await this.s3Service.upload(s3Key, xmlContent);
      } catch (error) {
        await this.processingLogRepository.logProcessingStep({
          chaveAcesso: event.chaveAcesso,
          stage: 'XML_PROCESS',
          status: 'ERROR',
          errorCode: 'NF009',
          errorMessage: (error as Error).message,
          durationMs: Date.now() - startTime,
          metadata: { s3Key },
        });

        throw new RetryableException(`S3 upload failed: ${(error as Error).message}`, 'NF009', {
          chaveAcesso: event.chaveAcesso,
          s3Key,
        });
      }
    }

    const processedEvent = {
      ...metadata,
      chaveAcesso: event.chaveAcesso,
      idempotencyKey: event.idempotencyKey,
      xmlS3Key: s3Key,
      source: event.source,
      processedAt: new Date().toISOString(),
    };

    await this.rabbitMQService.publish(
      EXCHANGES.EVENTS,
      ROUTING_KEYS.NF_PROCESSED,
      processedEvent as unknown as Record<string, unknown>,
    );

    const duration = Date.now() - startTime;

    await this.processingLogRepository.logProcessingStep({
      chaveAcesso: event.chaveAcesso,
      stage: 'XML_PROCESS',
      status: 'SUCCESS',
      durationMs: duration,
      metadata: { s3Key },
    });

    this.logger.log(`XML processed: ${event.chaveAcesso} in ${duration}ms`);
  }

  parseXml(xmlContent: string): XmlMetadataDto {
    const nNF = extractXmlTag(xmlContent, 'nNF');
    const serie = extractXmlTag(xmlContent, 'serie');
    const mod = extractXmlTag(xmlContent, 'mod');
    const dhEmi = extractXmlTag(xmlContent, 'dhEmi');
    const natOp = extractXmlTag(xmlContent, 'natOp');
    const tpNF = extractXmlTag(xmlContent, 'tpNF');
    const vProd = extractXmlTag(xmlContent, 'vProd');
    const vNF = extractXmlTag(xmlContent, 'vNF');

    if (!nNF) {
      throw new Error('Missing required field: nNF');
    }

    const emitCnpj = extractXmlTag(xmlContent, 'CNPJ') ?? '';
    const emitRazao = extractXmlTag(xmlContent, 'xNome') ?? '';

    const chaveRegex = /Id="NFe(\d{44})"/;
    const chaveMatch = chaveRegex.exec(xmlContent);
    const chaveAcesso = chaveMatch ? chaveMatch[1] : '';

    return {
      chaveAcesso,
      numero: parseInt(nNF, 10),
      serie: parseInt(serie ?? '1', 10),
      modelo: mod ?? '55',
      dataEmissao: dhEmi ?? new Date().toISOString(),
      naturezaOperacao: natOp ?? 'VENDA',
      tipoOperacao: parseInt(tpNF ?? '1', 10),
      valorTotalProdutos: parseFloat(vProd ?? '0'),
      valorTotalNf: parseFloat(vNF ?? '0'),
      emitente: {
        cnpj: emitCnpj,
        razaoSocial: emitRazao,
      },
      destinatario: {
        razaoSocial: '',
      },
      itens: [],
      pagamentos: [],
    };
  }
}
