import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalInvoice } from '../persistence/entities/external-invoice.entity';
import { InvoiceImport } from '../persistence/entities/invoice-import.entity';
import { InvoiceImportLog } from '../persistence/entities/invoice-import-log.entity';
import { S3Module } from '../../infrastructure/s3/s3.module';
import { NfReceiverModule } from '../nf-receiver/nf-receiver.module';
import { ExternalInvoiceCreatorService } from './external-invoice-creator.service';
import { QiveImporterService } from './qive-importer.service';
import { ImapImporterService } from './imap-importer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalInvoice, InvoiceImport, InvoiceImportLog]),
    S3Module,
    NfReceiverModule,
  ],
  providers: [ExternalInvoiceCreatorService, QiveImporterService, ImapImporterService],
  exports: [ExternalInvoiceCreatorService, QiveImporterService, ImapImporterService],
})
export class InvoiceImportModule {}
