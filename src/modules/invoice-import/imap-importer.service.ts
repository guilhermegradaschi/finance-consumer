import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalInvoiceCreatorService } from './external-invoice-creator.service';
import { InvoiceImport } from '../persistence/entities/invoice-import.entity';
import { InvoiceImportLog } from '../persistence/entities/invoice-import-log.entity';
import { InvoiceImportStatus } from '../../common/enums/invoice-import-status.enum';
import { InvoiceImportLogStatus } from '../../common/enums/invoice-import-log-status.enum';
import { ExternalInvoiceSource } from '../../common/enums/external-invoice-source.enum';

@Injectable()
export class ImapImporterService {
  private readonly logger = new Logger(ImapImporterService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly externalInvoiceCreator: ExternalInvoiceCreatorService,
    @InjectRepository(InvoiceImport)
    private readonly invoiceImportRepo: Repository<InvoiceImport>,
    @InjectRepository(InvoiceImportLog)
    private readonly invoiceImportLogRepo: Repository<InvoiceImportLog>,
  ) {
    this.enabled = this.configService.get<boolean>('IMAP_ENABLED', false);
  }

  async import(filterStart: Date, filterEnd: Date): Promise<InvoiceImport | null> {
    if (!this.enabled) {
      this.logger.debug('IMAP import disabled');
      return null;
    }

    this.logger.log('ExternalInvoicesImporterJob Iniciado (IMAP)');
    this.logger.log('Conectando ao servidor IMAP');

    const invoiceImport = this.invoiceImportRepo.create({
      filterStart,
      filterEnd,
      source: ExternalInvoiceSource.IMAP,
      status: InvoiceImportStatus.PENDING,
      automatic: true,
    });
    const savedImport = await this.invoiceImportRepo.save(invoiceImport);

    try {
      const emails = await this.fetchUnseenEmails();
      this.logger.log(`Encontrados ${emails.length} emails nao lidos`);

      for (const email of emails) {
        try {
          await this.processEmail(email, savedImport.id);
        } catch (error) {
          this.logger.error(`Error processing email: ${(error as Error).message}`);
          await this.invoiceImportLogRepo.save(
            this.invoiceImportLogRepo.create({
              invoiceImportId: savedImport.id,
              status: InvoiceImportLogStatus.ERROR,
              log: { general: [`Error processing email: ${(error as Error).message}`] },
              metadata: email.metadata ?? {},
            }),
          );
        }
      }

      savedImport.status = InvoiceImportStatus.SUCCESS;
      await this.invoiceImportRepo.save(savedImport);
      this.logger.log('ExternalInvoicesImporterJob Finalizado (IMAP)');
    } catch (error) {
      savedImport.status = InvoiceImportStatus.ERROR;
      await this.invoiceImportRepo.save(savedImport);
      this.logger.error(`ExternalInvoicesImporterJob falhou (IMAP): ${(error as Error).message}`);
      throw error;
    }

    return savedImport;
  }

  private async fetchUnseenEmails(): Promise<Array<{ xml: string; accessKey: string; from: string; metadata: Record<string, unknown> }>> {
    this.logger.debug('IMAP fetch not implemented in current phase - returning empty');
    return [];
  }

  private async processEmail(
    email: { xml: string; accessKey: string; from: string; metadata: Record<string, unknown> },
    invoiceImportId: string,
  ): Promise<void> {
    const source = email.from === 'notificacao@grupoamicci.com.br'
      ? ExternalInvoiceSource.BUYER
      : ExternalInvoiceSource.IMAP;

    const result = await this.externalInvoiceCreator.create(
      email.accessKey,
      email.xml,
      source,
      invoiceImportId,
    );

    const status = result.created
      ? InvoiceImportLogStatus.SUCCESS
      : result.ignored
        ? InvoiceImportLogStatus.IGNORED
        : InvoiceImportLogStatus.ERROR;

    await this.invoiceImportLogRepo.save(
      this.invoiceImportLogRepo.create({
        invoiceImportId,
        status,
        log: {
          general: [result.created ? 'NF imported' : (result.error ?? 'Ignored')],
          attachments: [{ filename: `${email.accessKey}.xml`, status: result.created ? 'success' : 'ignored', access_key: email.accessKey }],
        },
        metadata: email.metadata,
      }),
    );
  }
}
