import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { QiveImporterService } from '../invoice-import/qive-importer.service';
import { ImapImporterService } from '../invoice-import/imap-importer.service';
import { ExternalInvoicesProcessorService } from '../invoice-processor/external-invoices-processor.service';
import { InvoiceEventsImporterService } from '../invoice-events/invoice-events-importer.service';
import { InvoiceEventsProcessorService } from '../invoice-events/invoice-events-processor.service';

@Injectable()
export class NfPipelineCronService {
  private readonly logger = new Logger(NfPipelineCronService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly qiveImporter: QiveImporterService,
    private readonly imapImporter: ImapImporterService,
    private readonly externalInvoicesProcessor: ExternalInvoicesProcessorService,
    private readonly invoiceEventsImporter: InvoiceEventsImporterService,
    private readonly invoiceEventsProcessor: InvoiceEventsProcessorService,
  ) {}

  @Interval(60_000)
  async runScheduledTasks(): Promise<void> {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

    if (this.configService.get<boolean>('QIVE_CRON_ENABLED', false)) {
      try {
        await this.qiveImporter.import(start, end);
      } catch (e) {
        this.logger.error(`Qive cron failed: ${(e as Error).message}`);
      }
    }

    if (this.configService.get<boolean>('IMAP_CRON_ENABLED', false)) {
      try {
        await this.imapImporter.import(start, end);
      } catch (e) {
        this.logger.error(`IMAP cron failed: ${(e as Error).message}`);
      }
    }

    if (this.configService.get<boolean>('EXTERNAL_INVOICES_PROCESSOR_CRON_ENABLED', false)) {
      try {
        await this.externalInvoicesProcessor.process();
      } catch (e) {
        this.logger.error(`ExternalInvoicesProcessor cron failed: ${(e as Error).message}`);
      }
    }

    if (this.configService.get<boolean>('INVOICE_EVENTS_IMPORTER_CRON_ENABLED', false)) {
      try {
        await this.invoiceEventsImporter.import();
      } catch (e) {
        this.logger.error(`InvoiceEventsImporter cron failed: ${(e as Error).message}`);
      }
    }

    if (this.configService.get<boolean>('INVOICE_EVENTS_PROCESSOR_CRON_ENABLED', false)) {
      try {
        await this.invoiceEventsProcessor.process();
      } catch (e) {
        this.logger.error(`InvoiceEventsProcessor cron failed: ${(e as Error).message}`);
      }
    }
  }
}
