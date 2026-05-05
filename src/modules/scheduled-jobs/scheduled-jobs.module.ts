import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxMessage } from '../persistence/entities/outbox-message.entity';
import { OutboxPublisherService } from './outbox-publisher.service';
import { NfPipelineCronService } from './nf-pipeline-cron.service';
import { InvoiceImportModule } from '../invoice-import/invoice-import.module';
import { InvoiceProcessorModule } from '../invoice-processor/invoice-processor.module';
import { InvoiceEventsModule } from '../invoice-events/invoice-events.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([OutboxMessage]),
    InvoiceImportModule,
    InvoiceProcessorModule,
    InvoiceEventsModule,
  ],
  providers: [OutboxPublisherService, NfPipelineCronService],
})
export class ScheduledJobsModule {}
