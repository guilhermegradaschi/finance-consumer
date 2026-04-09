import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ExternalInvoice } from '../persistence/entities/external-invoice.entity';
import { ExternalInvoiceStatus } from '../../common/enums/external-invoice-status.enum';
import { ExternalInvoiceOperation } from '../../common/enums/external-invoice-operation.enum';
import { InvoiceCreatorService } from './invoice-creator.service';

@Injectable()
export class ExternalInvoicesProcessorService {
  private readonly logger = new Logger(ExternalInvoicesProcessorService.name);

  constructor(
    @InjectRepository(ExternalInvoice)
    private readonly externalInvoiceRepo: Repository<ExternalInvoice>,
    private readonly invoiceCreatorService: InvoiceCreatorService,
  ) {}

  async process(): Promise<void> {
    this.logger.log('ExternalInvoicesProcessorJob Iniciado');

    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const externalInvoices = await this.externalInvoiceRepo
      .createQueryBuilder('ei')
      .where('ei.status IN (:...statuses)', {
        statuses: [
          ExternalInvoiceStatus.PENDING,
          ExternalInvoiceStatus.ERROR,
          ExternalInvoiceStatus.PROCESSING,
        ],
      })
      .andWhere('ei.operation IN (:...operations)', {
        operations: [ExternalInvoiceOperation.VENDA, ExternalInvoiceOperation.DEVOLUCAO],
      })
      .andWhere('ei.date >= :startDate', { startDate: previousMonth })
      .andWhere('ei.date <= :endDate', { endDate: endOfCurrentMonth })
      .getMany();

    this.logger.log(`Found ${externalInvoices.length} external invoices to process`);

    const createdInvoiceNumbers = new Set<string>();

    try {
      for (const ei of externalInvoices) {
        await this.invoiceCreatorService.create(ei, createdInvoiceNumbers);
      }
    } finally {
      await this.forceStuckProcessingToError();
    }

    this.logger.log('ExternalInvoicesProcessorJob Finalizado');
  }

  private async forceStuckProcessingToError(): Promise<void> {
    const stuckCount = await this.externalInvoiceRepo
      .createQueryBuilder()
      .update(ExternalInvoice)
      .set({
        status: ExternalInvoiceStatus.ERROR,
        errorMessage: 'Forced from processing to error (stuck)',
      })
      .where('status = :status', { status: ExternalInvoiceStatus.PROCESSING })
      .execute();

    if (stuckCount.affected && stuckCount.affected > 0) {
      this.logger.warn(`Forced ${stuckCount.affected} stuck ExternalInvoices from processing to error`);
    }
  }
}
