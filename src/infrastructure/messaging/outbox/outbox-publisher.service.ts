import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { OutboxMessage } from '@infra/messaging/outbox/outbox-message.entity';
import { OutboxMessageStatus } from '@shared/enums/outbox-message-status.enum';

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);

  constructor(
    @InjectRepository(OutboxMessage)
    private readonly outboxRepo: Repository<OutboxMessage>,
    private readonly rabbitMQService: RabbitMQService,
    private readonly configService: ConfigService,
  ) {}

  @Interval(3000)
  async flushPending(): Promise<void> {
    if (!this.configService.get<boolean>('NFE_OUTBOX_ENABLED', false)) {
      return;
    }
    if (!this.rabbitMQService.isConnected()) {
      return;
    }

    const pending = await this.outboxRepo.find({
      where: { status: OutboxMessageStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    for (const row of pending) {
      try {
        await this.rabbitMQService.publish(
          row.exchange,
          row.routingKey,
          row.payload,
          row.headers as Record<string, unknown>,
        );
        row.status = OutboxMessageStatus.PUBLISHED;
        row.publishedAt = new Date();
        row.lastError = null;
        await this.outboxRepo.save(row);
      } catch (e) {
        row.attemptCount += 1;
        row.lastError = (e as Error).message;
        if (row.attemptCount >= 50) {
          row.status = OutboxMessageStatus.FAILED;
        }
        await this.outboxRepo.save(row);
        this.logger.error(`Outbox publish failed id=${row.id}: ${(e as Error).message}`);
      }
    }
  }
}
