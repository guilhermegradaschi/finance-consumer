import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { ReceitaWsClient } from './clients/receita-ws.client';
import { SefazClient } from './clients/sefaz.client';
import { EXCHANGES, ROUTING_KEYS } from '../../common/constants/queues.constants';
import { NfProcessedEventDto } from '../xml-processor/dto/nf-processed-event.dto';
import { ValidationResultDto } from './dto/validation-result.dto';

@Injectable()
export class BusinessValidatorService {
  private readonly logger = new Logger(BusinessValidatorService.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly receitaWsClient: ReceitaWsClient,
    private readonly sefazClient: SefazClient,
  ) {}

  async validate(event: NfProcessedEventDto): Promise<ValidationResultDto> {
    const startTime = Date.now();
    const errors: string[] = [];

    const cnpjResult = await this.receitaWsClient.validateCnpj(event.emitente.cnpj);
    if (!cnpjResult.valid) {
      errors.push(`CNPJ ${event.emitente.cnpj} is not active: ${cnpjResult.situacao}`);
    }

    const sefazResult = await this.sefazClient.validateNfe(event.chaveAcesso);
    if (!sefazResult.valid) {
      errors.push(`SEFAZ validation failed: ${sefazResult.status}`);
    }

    const result: ValidationResultDto = {
      cnpjValidation: cnpjResult,
      sefazValidation: sefazResult,
      isValid: errors.length === 0,
      errors,
    };

    const validatedEvent = {
      chaveAcesso: event.chaveAcesso,
      idempotencyKey: event.idempotencyKey,
      cnpjValidation: cnpjResult,
      sefazValidation: sefazResult,
      processedData: event,
      source: event.source,
      validatedAt: new Date().toISOString(),
    };

    await this.rabbitMQService.publish(
      EXCHANGES.EVENTS,
      ROUTING_KEYS.NF_VALIDATED,
      validatedEvent as unknown as Record<string, unknown>,
    );

    const duration = Date.now() - startTime;
    this.logger.log(`Business validation for ${event.chaveAcesso}: ${result.isValid ? 'VALID' : 'INVALID'} in ${duration}ms`);

    return result;
  }
}
