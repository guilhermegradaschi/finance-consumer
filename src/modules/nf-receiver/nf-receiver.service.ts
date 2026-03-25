import { Injectable, Logger } from '@nestjs/common';
import { IdempotencyService } from '../../infrastructure/redis/idempotency.service';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { extractChaveAcessoFromXml, isValidChaveAcesso } from '../../common/utils/xml.util';
import { generateIdempotencyKey } from '../../common/utils/hash.util';
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
  ) {}

  private normalizeXmlContent(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && 'value' in raw) return String((raw as Record<string, unknown>).value);
    return String(raw ?? '');
  }

  async receive(dto: ReceiveNfDto): Promise<ReceiveResult> {
    const source = dto.source ?? NfSource.API;
    const xmlContent = this.normalizeXmlContent(dto.xmlContent);

    const chaveAcesso = extractChaveAcessoFromXml(xmlContent);
    if (!chaveAcesso || !isValidChaveAcesso(chaveAcesso)) {
      throw new NonRetryableException('Invalid or missing chave de acesso in XML', 'NF003');
    }

    const idempotencyKey = generateIdempotencyKey(chaveAcesso, source);

    const check = await this.idempotencyService.check(idempotencyKey);
    if (check.isDuplicate) {
      this.logger.warn(`Duplicate NF detected: ${chaveAcesso}`);
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

    this.logger.log(`NF received: ${chaveAcesso} from ${source}`);

    return {
      chaveAcesso,
      idempotencyKey,
      status: 'RECEIVED',
      alreadyProcessed: false,
    };
  }
}
