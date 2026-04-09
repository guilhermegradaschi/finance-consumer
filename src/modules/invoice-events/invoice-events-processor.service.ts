import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InvoiceEvent } from '../persistence/entities/invoice-event.entity';
import { Invoice } from '../persistence/entities/invoice.entity';
import { InvoiceEventStatus } from '../../common/enums/invoice-event-status.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { InvoiceCanceledCreatorService } from './invoice-canceled-creator.service';

@Injectable()
export class InvoiceEventsProcessorService {
  private readonly logger = new Logger(InvoiceEventsProcessorService.name);

  constructor(
    @InjectRepository(InvoiceEvent)
    private readonly invoiceEventRepo: Repository<InvoiceEvent>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly canceledCreatorService: InvoiceCanceledCreatorService,
  ) {}

  async process(): Promise<void> {
    this.logger.log('InvoiceEventsProcessorJob Iniciado');

    const events = await this.invoiceEventRepo.find({
      where: {
        status: In([InvoiceEventStatus.PENDING, InvoiceEventStatus.ERROR]),
      },
    });

    this.logger.log(`Found ${events.length} events to process`);

    for (const event of events) {
      try {
        await this.processEvent(event);
      } catch (error) {
        event.status = InvoiceEventStatus.ERROR;
        event.errorMessage = (error as Error).message;
        await this.invoiceEventRepo.save(event);
        this.logger.error(
          `Error processing event ${event.id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log('InvoiceEventsProcessorJob Finalizado');
  }

  private async processEvent(event: InvoiceEvent): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({
      where: { accessKey: event.accessKey },
    });

    if (!invoice) {
      event.status = InvoiceEventStatus.SKIPPED;
      event.errorMessage = `Invoice not found for access_key: ${event.accessKey}`;
      await this.invoiceEventRepo.save(event);
      this.logger.warn(`Invoice not found for event ${event.id} (access_key: ${event.accessKey})`);
      return;
    }

    if (invoice.status === InvoiceStatus.CANCELED) {
      event.status = InvoiceEventStatus.SKIPPED;
      event.errorMessage = 'Invoice already canceled';
      await this.invoiceEventRepo.save(event);
      this.logger.warn(`Invoice ${invoice.id} already canceled, skipping event ${event.id}`);
      return;
    }

    const canceledInvoice = await this.canceledCreatorService.create(invoice);

    event.status = InvoiceEventStatus.PROCESSED;
    event.invoiceId = invoice.id;
    await this.invoiceEventRepo.save(event);

    this.logger.log(
      `Event ${event.id} processed: canceled invoice ${invoice.id}, created ${canceledInvoice.id}`,
    );
  }
}
