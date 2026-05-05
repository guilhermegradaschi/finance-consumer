import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { assertXmlWellFormed } from '../../common/utils/xml.util';
import { generateHash } from '../../common/utils/hash.util';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { NfeEvent } from '../persistence/entities/nfe-event.entity';
import { InvoiceEventCreatorService } from './invoice-event-creator.service';

export interface IngestNfeEventInput {
  xmlContent?: string;
  xml_base64?: string;
  event_type?: string;
  correlation_id?: string;
}

@Injectable()
export class NfeEventIngestService {
  private readonly logger = new Logger(NfeEventIngestService.name);

  constructor(
    @InjectRepository(NfeEvent)
    private readonly nfeEventRepo: Repository<NfeEvent>,
    private readonly s3Service: S3Service,
    private readonly invoiceEventCreator: InvoiceEventCreatorService,
  ) {}

  async ingest(input: IngestNfeEventInput): Promise<Record<string, unknown>> {
    let xml = input.xmlContent?.trim() ?? '';
    if (input.xml_base64) {
      if (xml) {
        throw new BadRequestException('Informe apenas xmlContent ou xml_base64');
      }
      try {
        xml = Buffer.from(input.xml_base64, 'base64').toString('utf8').trim();
      } catch {
        throw new BadRequestException('xml_base64 inválido');
      }
    }
    if (!xml) {
      throw new BadRequestException('xmlContent ou xml_base64 é obrigatório');
    }

    assertXmlWellFormed(xml);

    const chMatch = /<chNFe>(\d{44})<\/chNFe>/.exec(xml);
    const accessKey = chMatch?.[1];
    if (!accessKey) {
      throw new BadRequestException('chNFe não encontrado no XML do evento');
    }

    let eventType = input.event_type?.trim();
    if (!eventType) {
      const tp = /<tpEvento>(\d+)<\/tpEvento>/.exec(xml);
      eventType = tp?.[1] ? `tp_${tp[1]}` : 'unknown';
    }

    const checksumSha256 = generateHash(xml);
    const idempotencyKey = generateHash(`${accessKey}:${eventType}:${checksumSha256}`);

    const existing = await this.nfeEventRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      return { status: 'duplicate', id: existing.id, accessKey };
    }

    const payloadStorageKey = this.s3Service.buildNfeEventStorageKey(accessKey, eventType, checksumSha256);
    await this.s3Service.upload(payloadStorageKey, xml, 'application/xml');

    const row = this.nfeEventRepo.create({
      idempotencyKey,
      accessKey,
      eventType,
      sequence: null,
      payloadStorageKey,
      checksumSha256,
      status: 'accepted',
      correlationId: input.correlation_id ?? null,
    });
    await this.nfeEventRepo.save(row);

    await this.invoiceEventCreator.create(accessKey, eventType, xml);

    this.logger.log(`NFe event ingested access_key=${accessKey} type=${eventType} id=${row.id}`);

    return {
      status: 'accepted',
      id: row.id,
      accessKey,
      eventType,
      payloadStorageKey,
    };
  }
}
