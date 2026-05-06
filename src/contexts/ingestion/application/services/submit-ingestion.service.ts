import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { IdempotencyService } from '@infra/redis/idempotency.service';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { S3Service } from '@infra/s3/s3.service';
import { NfProcessingLogRepository } from '@context/nfe-legacy/domain/repositories/nf-processing-log.repository';
import { assertXmlWellFormed, extractChaveAcessoFromXml, isValidChaveAcesso } from '@shared/utils/xml.util';
import { generateHash, generateIdempotencyKey } from '@shared/utils/hash.util';
import { NonRetryableException } from '@shared/exceptions/non-retryable.exception';
import { EXCHANGES, ROUTING_KEYS } from '@shared/constants/queues.constants';
import { NfSource } from '@shared/enums/nf-source.enum';
import { ReceiveNfDto } from '@context/ingestion/application/dto/receive-nf.dto';
import { NfReceivedEventDto } from '@context/ingestion/application/dto/nf-received-event.dto';
import { NfeIngestion } from '@context/ingestion/domain/entities/nfe-ingestion.entity';
import { NfeIngestionStatus } from '@context/ingestion/domain/enums/nfe-ingestion-status.enum';
import { OutboxMessage } from '@infra/messaging/outbox/outbox-message.entity';
import { OutboxMessageStatus } from '@shared/enums/outbox-message-status.enum';

export interface SubmitIngestionInput extends ReceiveNfDto {
  correlationId?: string;
  externalRef?: string;
  /** When true, removes prior `nfe_ingestions` row for the same idempotency key (reprocess path). */
  replaceExistingIngestion?: boolean;
}

export interface SubmitIngestionResult {
  chaveAcesso: string;
  idempotencyKey: string;
  status: string;
  alreadyProcessed: boolean;
  ingestionId?: string;
}

@Injectable()
export class SubmitIngestionService {
  private readonly logger = new Logger(SubmitIngestionService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(NfeIngestion)
    private readonly ingestionRepo: Repository<NfeIngestion>,
    @InjectRepository(OutboxMessage)
    private readonly outboxRepo: Repository<OutboxMessage>,
    private readonly idempotencyService: IdempotencyService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly s3Service: S3Service,
    private readonly processingLogRepository: NfProcessingLogRepository,
    private readonly configService: ConfigService,
  ) {}

  private normalizeXmlContent(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && 'value' in raw) return String((raw as Record<string, unknown>).value);
    return String(raw ?? '');
  }

  async submit(dto: SubmitIngestionInput): Promise<SubmitIngestionResult> {
    const startTime = Date.now();
    const source = String(dto.source ?? NfSource.API);
    const xmlContent = this.normalizeXmlContent(dto.xmlContent).trim();
    const correlationId = dto.correlationId?.trim() || undefined;
    const externalRef = dto.externalRef?.trim() || null;
    const legacyPayload = this.configService.get<boolean>('NFE_LEGACY_RABBIT_PAYLOAD', true);
    const outboxEnabled = this.configService.get<boolean>('NFE_OUTBOX_ENABLED', false);

    try {
      assertXmlWellFormed(xmlContent);
    } catch (e) {
      const msg = (e as Error).message;
      await this.processingLogRepository.logProcessingStep({
        chaveAcesso: generateHash(xmlContent).substring(0, 44),
        stage: 'RECEIVE',
        status: 'REJECTED',
        source: source as NfSource,
        errorCode: 'XML_MALFORMED',
        errorMessage: msg,
        durationMs: Date.now() - startTime,
        metadata: { correlationId },
      });
      throw new NonRetryableException(msg, 'XML_MALFORMED');
    }

    const chaveAcesso = extractChaveAcessoFromXml(xmlContent);
    if (!chaveAcesso || !isValidChaveAcesso(chaveAcesso)) {
      const fallbackKey = generateHash(xmlContent).substring(0, 44);
      await this.processingLogRepository.logProcessingStep({
        chaveAcesso: chaveAcesso || fallbackKey,
        stage: 'RECEIVE',
        status: 'REJECTED',
        source: source as NfSource,
        errorCode: 'INVALID_PAYLOAD',
        errorMessage: 'Invalid or missing chave de acesso in XML',
        durationMs: Date.now() - startTime,
        metadata: { correlationId },
      });
      throw new NonRetryableException('Invalid or missing chave de acesso in XML', 'INVALID_PAYLOAD');
    }

    const idempotencyKey = generateIdempotencyKey(chaveAcesso, source);

    if (dto.replaceExistingIngestion) {
      await this.ingestionRepo.delete({ idempotencyKey });
    }

    const existingRow = await this.ingestionRepo.findOne({ where: { idempotencyKey } });
    if (existingRow) {
      await this.processingLogRepository.logProcessingStep({
        chaveAcesso,
        stage: 'RECEIVE',
        status: 'DUPLICATE',
        source: source as NfSource,
        durationMs: Date.now() - startTime,
        metadata: { idempotencyKey, ingestionId: existingRow.id, correlationId },
      });
      return {
        chaveAcesso,
        idempotencyKey,
        status: 'DUPLICATE',
        alreadyProcessed: true,
        ingestionId: existingRow.id,
      };
    }

    const redisCheck = await this.idempotencyService.check(idempotencyKey);
    if (redisCheck.isDuplicate) {
      const again = await this.ingestionRepo.findOne({ where: { idempotencyKey } });
      if (again) {
        return {
          chaveAcesso,
          idempotencyKey,
          status: 'DUPLICATE',
          alreadyProcessed: true,
          ingestionId: again.id,
        };
      }
    }

    const checksumSha256 = generateHash(xmlContent);
    const rawStorageKey = this.s3Service.buildNfeRawKeyFromAccessKey(chaveAcesso);

    try {
      await this.s3Service.upload(rawStorageKey, xmlContent);
    } catch (error) {
      await this.processingLogRepository.logProcessingStep({
        chaveAcesso,
        stage: 'RECEIVE',
        status: 'REJECTED',
        source: source as NfSource,
        errorCode: 'S3_UPLOAD_FAILED',
        errorMessage: (error as Error).message,
        durationMs: Date.now() - startTime,
        metadata: { rawStorageKey, correlationId },
      });
      throw error;
    }

    let ingestion: NfeIngestion;
    const ingestionEntity = this.ingestionRepo.create({
      idempotencyKey,
      source,
      externalRef,
      accessKey: chaveAcesso,
      rawStorageKey,
      checksumSha256,
      status: NfeIngestionStatus.ACCEPTED,
      correlationId: correlationId ?? null,
    });

    try {
      if (outboxEnabled) {
        const obEntity = this.outboxRepo.create({
          exchange: EXCHANGES.EVENTS,
          routingKey: ROUTING_KEYS.NF_RECEIVED,
          payload: {} as Record<string, unknown>,
          headers: {} as Record<string, unknown>,
          status: OutboxMessageStatus.PENDING,
        });
        await this.dataSource.transaction(async (manager) => {
          const saved = await manager.save(NfeIngestion, ingestionEntity);
          const eventDraft: NfReceivedEventDto = {
            chaveAcesso,
            source,
            idempotencyKey,
            receivedAt: new Date().toISOString(),
            metadata: dto.metadata,
            ingestionId: saved.id,
            rawStorageKey,
            checksumSha256,
            correlationId,
            preUploadedToS3: true,
          };
          if (legacyPayload) {
            eventDraft.xmlContent = xmlContent;
          }
          const hdr: Record<string, unknown> = {};
          if (correlationId) hdr['correlation_id'] = correlationId;
          hdr['ingestion_id'] = saved.id;
          obEntity.payload = eventDraft as unknown as Record<string, unknown>;
          obEntity.headers = hdr;
          await manager.save(OutboxMessage, obEntity);
        });
        ingestion = await this.ingestionRepo.findOneOrFail({ where: { idempotencyKey } });
      } else {
        await this.ingestionRepo.save(ingestionEntity);
        ingestion = ingestionEntity;
      }
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === '23505') {
        await this.s3Service.delete(rawStorageKey).catch(() => undefined);
        const row = await this.ingestionRepo.findOne({ where: { idempotencyKey } });
        if (row) {
          return {
            chaveAcesso,
            idempotencyKey,
            status: 'DUPLICATE',
            alreadyProcessed: true,
            ingestionId: row.id,
          };
        }
      }
      throw error;
    }

    await this.idempotencyService.register(idempotencyKey, {
      status: 'RECEIVED',
      chaveAcesso,
      source,
      ingestionId: ingestion.id,
    });

    const event: NfReceivedEventDto = {
      chaveAcesso,
      source,
      idempotencyKey,
      receivedAt: new Date().toISOString(),
      metadata: dto.metadata,
      ingestionId: ingestion.id,
      rawStorageKey,
      checksumSha256,
      correlationId,
      preUploadedToS3: true,
    };
    if (legacyPayload) {
      event.xmlContent = xmlContent;
    }

    const headers: Record<string, unknown> = {};
    if (correlationId) {
      headers['correlation_id'] = correlationId;
    }
    if (ingestion.id) {
      headers['ingestion_id'] = ingestion.id;
    }

    if (!outboxEnabled) {
      await this.rabbitMQService.publish(
        EXCHANGES.EVENTS,
        ROUTING_KEYS.NF_RECEIVED,
        event as unknown as Record<string, unknown>,
        headers,
      );
    }

    await this.processingLogRepository.logProcessingStep({
      chaveAcesso,
      stage: 'RECEIVE',
      status: 'SUCCESS',
      source: source as NfSource,
      durationMs: Date.now() - startTime,
      metadata: { idempotencyKey, source, ingestionId: ingestion.id, correlationId, slimPayload: !legacyPayload },
    });

    this.logger.log(`Ingestion accepted: ${chaveAcesso} ingestionId=${ingestion.id}`);

    return {
      chaveAcesso,
      idempotencyKey,
      status: 'RECEIVED',
      alreadyProcessed: false,
      ingestionId: ingestion.id,
    };
  }
}
