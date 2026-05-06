import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { XmlProcessorService } from '@context/nfe-legacy/infrastructure/xml/xml-processor.service';
import { QUEUES } from '@shared/constants/queues.constants';
import { NfReceivedEventDto } from '@context/ingestion/application/dto/nf-received-event.dto';

@Injectable()
export class XmlProcessorConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(XmlProcessorConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly xmlProcessorService: XmlProcessorService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMQService.consume(
      QUEUES.NF_PROCESS_XML,
      async (msg) => {
        const event = msg as unknown as NfReceivedEventDto;
        this.logger.log(`Processing XML for: ${event.chaveAcesso}`);
        await this.xmlProcessorService.process(event);
      },
      { retryRoutingKey: 'retry.xml', dlqRoutingKey: 'dlq.xml' },
    );
  }
}
