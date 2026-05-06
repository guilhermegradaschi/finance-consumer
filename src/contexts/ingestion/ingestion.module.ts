import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NfeIngestion } from '@context/ingestion/domain/entities/nfe-ingestion.entity';
import { InvoiceImport } from '@context/ingestion/domain/entities/invoice-import.entity';
import { InvoiceImportLog } from '@context/ingestion/domain/entities/invoice-import-log.entity';
import { NfReceiverService } from '@context/ingestion/application/services/nf-receiver.service';
import { SubmitIngestionService } from '@context/ingestion/application/services/submit-ingestion.service';
import { QiveImporterService } from '@context/ingestion/infrastructure/qive/qive-importer.service';
import { ExternalInvoiceCreatorService } from '@context/ingestion/infrastructure/qive/external-invoice-creator.service';
import { ImapImporterService } from '@context/ingestion/infrastructure/imap/imap-importer.service';
import { EmailConsumerService } from '@context/ingestion/infrastructure/email-stub/email-consumer.service';
import { S3ListenerService } from '@context/ingestion/infrastructure/s3-listener/s3-listener.service';
import { OutboxMessage } from '@infra/messaging/outbox/outbox-message.entity';
import { S3Module } from '@infra/s3/s3.module';
import { NfeLegacyModule } from '@context/nfe-legacy/nfe-legacy.module';
import { InvoiceModule } from '@context/invoice/invoice.module';

const ingestionEntities = [NfeIngestion, InvoiceImport, InvoiceImportLog];

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => NfeLegacyModule),
    InvoiceModule,
    S3Module,
    TypeOrmModule.forFeature([...ingestionEntities, OutboxMessage]),
  ],
  providers: [
    NfReceiverService,
    SubmitIngestionService,
    QiveImporterService,
    ExternalInvoiceCreatorService,
    ImapImporterService,
    EmailConsumerService,
    S3ListenerService,
  ],
  exports: [
    TypeOrmModule,
    NfReceiverService,
    SubmitIngestionService,
    QiveImporterService,
    ImapImporterService,
    ExternalInvoiceCreatorService,
  ],
})
export class IngestionModule {}
