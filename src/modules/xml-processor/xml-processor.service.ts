import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { NonRetryableException } from '../../common/exceptions/non-retryable.exception';
import { RetryableException } from '../../common/exceptions/retryable.exception';
import { EXCHANGES, ROUTING_KEYS } from '../../common/constants/queues.constants';
import { extractXmlTag } from '../../common/utils/xml.util';
import { NfReceivedEventDto } from '../nf-receiver/dto/nf-received-event.dto';
import { XmlMetadataDto } from './dto/xml-metadata.dto';

@Injectable()
export class XmlProcessorService {
  private readonly logger = new Logger(XmlProcessorService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async process(event: NfReceivedEventDto): Promise<void> {
    const startTime = Date.now();

    let metadata: XmlMetadataDto;
    try {
      metadata = this.parseXml(event.xmlContent);
    } catch (error) {
      throw new NonRetryableException(
        `XML parsing failed: ${(error as Error).message}`,
        'NF001',
        { chaveAcesso: event.chaveAcesso },
      );
    }

    const s3Key = this.s3Service.buildNfKey(event.chaveAcesso);
    try {
      await this.s3Service.upload(s3Key, event.xmlContent);
    } catch (error) {
      throw new RetryableException(
        `S3 upload failed: ${(error as Error).message}`,
        'NF009',
        { chaveAcesso: event.chaveAcesso, s3Key },
      );
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
