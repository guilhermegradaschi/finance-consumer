import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { PersistenceService } from '@context/nfe-legacy/application/services/persistence.service';
import { QUEUES } from '@shared/constants/queues.constants';
import { NfValidatedEventDto } from '@context/nfe-legacy/application/dto/nf-validated-event.dto';

@Injectable()
export class PersistenceConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(PersistenceConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly persistenceService: PersistenceService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMQService.consume(
      QUEUES.NF_PERSIST,
      async (msg) => {
        const event = msg as unknown as NfValidatedEventDto;
        this.logger.log(`Persisting NF: ${event.chaveAcesso}`);
        await this.persistenceService.persist(event);
      },
      { retryRoutingKey: 'retry.persist', dlqRoutingKey: 'dlq.persist' },
    );
  }
}
