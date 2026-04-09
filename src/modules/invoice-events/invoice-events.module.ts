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

@Module({
  imports: [
    TypeOrmModule.forFeature([InvoiceEvent, InvoiceEventsImport, Invoice, InvoiceItem]),
    S3Module,
  ],
  providers: [
    InvoiceEventCreatorService,
    InvoiceEventsImporterService,
    InvoiceEventsProcessorService,
    InvoiceCanceledCreatorService,
  ],
  exports: [
    InvoiceEventsImporterService,
    InvoiceEventsProcessorService,
  ],
})
export class InvoiceEventsModule {}
