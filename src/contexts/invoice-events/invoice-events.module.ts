import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEvent } from '@context/invoice-events/domain/entities/invoice-event.entity';
import { InvoiceEventsImport } from '@context/invoice-events/domain/entities/invoice-events-import.entity';
import { NfeEvent } from '@context/invoice-events/domain/entities/nfe-event.entity';
import { InvoiceEventCreatorService } from '@context/invoice-events/application/services/invoice-event-creator.service';
import { InvoiceEventsImporterService } from '@context/invoice-events/application/services/invoice-events-importer.service';
import { InvoiceEventsProcessorService } from '@context/invoice-events/application/services/invoice-events-processor.service';
import { InvoiceCanceledCreatorService } from '@context/invoice-events/application/services/invoice-canceled-creator.service';
import { NfeEventIngestService } from '@context/invoice-events/application/services/nfe-event-ingest.service';
import { S3Module } from '@infra/s3/s3.module';
import { InvoiceModule } from '@context/invoice/invoice.module';

const eventEntities = [InvoiceEvent, InvoiceEventsImport, NfeEvent];

@Module({
  imports: [TypeOrmModule.forFeature(eventEntities), S3Module, InvoiceModule],
  providers: [
    InvoiceEventCreatorService,
    InvoiceEventsImporterService,
    InvoiceEventsProcessorService,
    InvoiceCanceledCreatorService,
    NfeEventIngestService,
  ],
  exports: [TypeOrmModule, InvoiceEventsImporterService, InvoiceEventsProcessorService, NfeEventIngestService],
})
export class InvoiceEventsModule {}
