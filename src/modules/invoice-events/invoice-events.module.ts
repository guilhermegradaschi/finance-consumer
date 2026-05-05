import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEvent } from '../persistence/entities/invoice-event.entity';
import { InvoiceEventsImport } from '../persistence/entities/invoice-events-import.entity';
import { Invoice } from '../persistence/entities/invoice.entity';
import { InvoiceItem } from '../persistence/entities/invoice-item.entity';
import { S3Module } from '../../infrastructure/s3/s3.module';
import { InvoiceEventCreatorService } from './invoice-event-creator.service';
import { InvoiceEventsImporterService } from './invoice-events-importer.service';
import { InvoiceEventsProcessorService } from './invoice-events-processor.service';
import { InvoiceCanceledCreatorService } from './invoice-canceled-creator.service';
import { NfeEvent } from '../persistence/entities/nfe-event.entity';
import { NfeEventIngestService } from './nfe-event-ingest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InvoiceEvent, InvoiceEventsImport, Invoice, InvoiceItem, NfeEvent]),
    S3Module,
  ],
  providers: [
    InvoiceEventCreatorService,
    InvoiceEventsImporterService,
    InvoiceEventsProcessorService,
    InvoiceCanceledCreatorService,
    NfeEventIngestService,
  ],
  exports: [
    InvoiceEventsImporterService,
    InvoiceEventsProcessorService,
    NfeEventIngestService,
  ],
})
export class InvoiceEventsModule {}
