import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { XmlProcessorService } from './xml-processor.service';
import { QUEUES } from '../../common/constants/queues.constants';
import { NfReceivedEventDto } from '../nf-receiver/dto/nf-received-event.dto';

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
