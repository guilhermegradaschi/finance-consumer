import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { BusinessValidatorService } from '@context/nfe-legacy/infrastructure/sefaz/business-validator.service';
import { QUEUES } from '@shared/constants/queues.constants';
import { NfProcessedEventDto } from '@context/nfe-legacy/application/dto/nf-processed-event.dto';

@Injectable()
export class BusinessValidatorConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(BusinessValidatorConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly businessValidatorService: BusinessValidatorService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMQService.consume(
      QUEUES.NF_VALIDATE_BUSINESS,
      async (msg) => {
        const event = msg as unknown as NfProcessedEventDto;
        this.logger.log(`Validating business rules for: ${event.chaveAcesso}`);
        await this.businessValidatorService.validate(event);
      },
      { retryRoutingKey: 'retry.business', dlqRoutingKey: 'dlq.business' },
    );
  }
}
