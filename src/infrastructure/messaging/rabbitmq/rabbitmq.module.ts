import { Module, Global } from '@nestjs/common';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';

@Global()
@Module({
  providers: [RabbitMQService],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
