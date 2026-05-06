import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxMessage } from '@infra/messaging/outbox/outbox-message.entity';
import { OutboxPublisherService } from '@infra/messaging/outbox/outbox-publisher.service';
import { NfPipelineCronService } from '@infra/scheduling/nf-pipeline-cron.service';
import { IngestionModule } from '@context/ingestion/ingestion.module';
import { InvoiceModule } from '@context/invoice/invoice.module';
import { InvoiceEventsModule } from '@context/invoice-events/invoice-events.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([OutboxMessage]),
    IngestionModule,
    InvoiceModule,
    InvoiceEventsModule,
  ],
  providers: [OutboxPublisherService, NfPipelineCronService],
})
export class SchedulingModule {}
