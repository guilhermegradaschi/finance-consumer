import { Injectable, Logger } from '@nestjs/common';
import { IdempotencyService } from '../../infrastructure/redis/idempotency.service';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '../persistence/repositories/nf-processing-log.repository';
import { extractChaveAcessoFromXml, isValidChaveAcesso } from '../../common/utils/xml.util';
import { generateHash, generateIdempotencyKey } from '../../common/utils/hash.util';
import { NonRetryableException } from '../../common/exceptions/non-retryable.exception';
import { EXCHANGES, ROUTING_KEYS } from '../../common/constants/queues.constants';
import { NfSource } from '../../common/enums/nf-source.enum';
import { ReceiveNfDto } from './dto/receive-nf.dto';
import { NfReceivedEventDto } from './dto/nf-received-event.dto';

export interface ReceiveResult {
  chaveAcesso: string;
  idempotencyKey: string;
  status: string;
  alreadyProcessed: boolean;
}

@Injectable()
export class NfReceiverService {
  private readonly logger = new Logger(NfReceiverService.name);

  constructor(
    private readonly idempotencyService: IdempotencyService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly processingLogRepository: NfProcessingLogRepository,
  ) {}

  private normalizeXmlContent(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && 'value' in raw) return String((raw as Record<string, unknown>).value);
    return String(raw ?? '');
  }

  async receive(dto: ReceiveNfDto): Promise<ReceiveResult> {
    const startTime = Date.now();
    const source = dto.source ?? NfSource.API;
    const xmlContent = this.normalizeXmlContent(dto.xmlContent);

    const chaveAcesso = extractChaveAcessoFromXml(xmlContent);
    if (!chaveAcesso || !isValidChaveAcesso(chaveAcesso)) {
      const errorMsg = 'Invalid or missing chave de acesso in XML';
      const fallbackKey = generateHash(xmlContent).substring(0, 44);

      await this.processingLogRepository.logProcessingStep({
        chaveAcesso: chaveAcesso || fallbackKey,
        stage: 'RECEIVE',
        status: 'REJECTED',
        source,
        errorCode: 'NF003',
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
        metadata: { contentHash: fallbackKey, reason: errorMsg },
      });

      this.logger.warn(`NF rejected (invalid XML): chave=${chaveAcesso || 'MISSING'}, hash=${fallbackKey}`);
      throw new NonRetryableException(errorMsg, 'NF003');
    }

    const idempotencyKey = generateIdempotencyKey(chaveAcesso, source);

    const check = await this.idempotencyService.check(idempotencyKey);
    if (check.isDuplicate) {
      this.logger.warn(`Duplicate NF detected: ${chaveAcesso}`);

      await this.processingLogRepository.logProcessingStep({
        chaveAcesso,
        stage: 'RECEIVE',
        status: 'DUPLICATE',
        source,
        durationMs: Date.now() - startTime,
        metadata: { idempotencyKey, isDuplicate: true },
      });

      return {
        chaveAcesso,
        idempotencyKey,
        status: 'DUPLICATE',
        alreadyProcessed: true,
      };
    }

    await this.idempotencyService.register(idempotencyKey, {
      status: 'RECEIVED',
      chaveAcesso,
      source,
    });

    const event: NfReceivedEventDto = {
      chaveAcesso,
      xmlContent,
      source,
      idempotencyKey,
      receivedAt: new Date().toISOString(),
      metadata: dto.metadata,
    };

    await this.rabbitMQService.publish(EXCHANGES.EVENTS, ROUTING_KEYS.NF_RECEIVED, event as unknown as Record<string, unknown>);

    await this.processingLogRepository.logProcessingStep({
      chaveAcesso,
      stage: 'RECEIVE',
      status: 'SUCCESS',
      source,
      durationMs: Date.now() - startTime,
      metadata: { idempotencyKey, source },
    });

    this.logger.log(`NF received: ${chaveAcesso} from ${source}`);

    return {
      chaveAcesso,
      idempotencyKey,
      status: 'RECEIVED',
      alreadyProcessed: false,
    };
  }
}
