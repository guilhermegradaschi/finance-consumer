import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QiveClient } from '../../infrastructure/http/clients/qive.client';
import { ExternalInvoiceCreatorService } from './external-invoice-creator.service';
import { InvoiceImport } from '../persistence/entities/invoice-import.entity';
import { InvoiceImportLog } from '../persistence/entities/invoice-import-log.entity';
import { InvoiceImportStatus } from '../../common/enums/invoice-import-status.enum';
import { InvoiceImportLogStatus } from '../../common/enums/invoice-import-log-status.enum';
import { ExternalInvoiceSource } from '../../common/enums/external-invoice-source.enum';

@Injectable()
export class QiveImporterService {
  private readonly logger = new Logger(QiveImporterService.name);

  constructor(
    private readonly qiveClient: QiveClient,
    private readonly externalInvoiceCreator: ExternalInvoiceCreatorService,
    @InjectRepository(InvoiceImport)
    private readonly invoiceImportRepo: Repository<InvoiceImport>,
    @InjectRepository(InvoiceImportLog)
    private readonly invoiceImportLogRepo: Repository<InvoiceImportLog>,
  ) {}

  async import(filterStart: Date, filterEnd: Date): Promise<InvoiceImport> {
    this.logger.log('ExternalInvoicesImporterJob Iniciado (Qive)');

    const invoiceImport = this.invoiceImportRepo.create({
      filterStart,
      filterEnd,
      source: ExternalInvoiceSource.QIVE,
      status: InvoiceImportStatus.PENDING,
      automatic: true,
    });
    const savedImport = await this.invoiceImportRepo.save(invoiceImport);

    try {
      const fromStr = this.formatDate(filterStart);
      const toStr = this.formatDate(filterEnd);
      const pages = await this.qiveClient.fetchAuthorizedNfes(fromStr, toStr);

      let totalReceived = 0;
      let totalSuccess = 0;
      let totalError = 0;
      let totalIgnored = 0;

      for (const page of pages) {
        const accessKeysSuccess: string[] = [];
        const accessKeysError: string[] = [];
        const accessKeysIgnored: string[] = [];

        for (const item of page.data) {
          totalReceived++;
          try {
            const xml = Buffer.from(item.xml, 'base64').toString('utf-8');
            const result = await this.externalInvoiceCreator.create(
              item.access_key,
              xml,
              ExternalInvoiceSource.QIVE,
              savedImport.id,
            );

            if (result.created) {
              totalSuccess++;
              accessKeysSuccess.push(item.access_key);
            } else if (result.ignored) {
              totalIgnored++;
              accessKeysIgnored.push(item.access_key);
            } else {
              totalError++;
              accessKeysError.push(item.access_key);
            }
          } catch (error) {
            totalError++;
            accessKeysError.push(item.access_key);
            this.logger.error(`Error importing NF ${item.access_key}: ${(error as Error).message}`);
          }
        }

        await this.invoiceImportLogRepo.save(
          this.invoiceImportLogRepo.create({
            invoiceImportId: savedImport.id,
            status: accessKeysError.length > 0 ? InvoiceImportLogStatus.ERROR : InvoiceImportLogStatus.SUCCESS,
            log: { general: [`Processed page with ${page.data.length} NFes`] },
            metadata: {
              received_count: page.data.length,
              success_count: accessKeysSuccess.length,
              error_count: accessKeysError.length,
              ignored_count: accessKeysIgnored.length,
              access_keys_success: accessKeysSuccess,
              access_keys_error: accessKeysError,
              access_keys_ignored: accessKeysIgnored,
            },
          }),
        );
      }

      savedImport.status = InvoiceImportStatus.SUCCESS;
      await this.invoiceImportRepo.save(savedImport);

      this.logger.log(
        `ExternalInvoicesImporterJob Finalizado (Qive): received=${totalReceived} success=${totalSuccess} errors=${totalError} ignored=${totalIgnored}`,
      );
    } catch (error) {
      savedImport.status = InvoiceImportStatus.ERROR;
      await this.invoiceImportRepo.save(savedImport);
      this.logger.error(`ExternalInvoicesImporterJob falhou: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }

    return savedImport;
  }

  private formatDate(date: Date): string {
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }
}
