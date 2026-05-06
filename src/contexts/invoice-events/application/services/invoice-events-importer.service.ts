import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QiveClient } from '@infra/http/clients/qive.client';
import { InvoiceEventCreatorService } from '@context/invoice-events/application/services/invoice-event-creator.service';
import { InvoiceEventsImport } from '@context/invoice-events/domain/entities/invoice-events-import.entity';
import { InvoiceImportStatus } from '@context/ingestion/domain/enums/invoice-import-status.enum';

@Injectable()
export class InvoiceEventsImporterService {
  private readonly logger = new Logger(InvoiceEventsImporterService.name);

  constructor(
    private readonly qiveClient: QiveClient,
    private readonly eventCreatorService: InvoiceEventCreatorService,
    @InjectRepository(InvoiceEventsImport)
    private readonly eventsImportRepo: Repository<InvoiceEventsImport>,
  ) {}

  async import(): Promise<void> {
    this.logger.log('InvoiceEventsImporterJob Iniciado');

    const lastImport = await this.eventsImportRepo.findOne({
      where: { status: InvoiceImportStatus.SUCCESS },
      order: { createdAt: 'DESC' },
    });

    const cursor = lastImport?.nextCursor ?? undefined;

    const eventsImport = this.eventsImportRepo.create({
      cursor: cursor ?? null,
      status: InvoiceImportStatus.PENDING,
    });
    const savedImport = await this.eventsImportRepo.save(eventsImport);

    try {
      this.logger.log(`Fetching NFe cancellation events with cursor: ${cursor ?? 'none'}`);
      const pages = await this.qiveClient.fetchCancellationEvents(cursor);

      let lastNextCursor: string | null = null;

      for (const page of pages) {
        for (const event of page.data) {
          try {
            await this.eventCreatorService.create(event.access_key, event.type, event.xml);
          } catch (error) {
            this.logger.error(`Error creating event for ${event.access_key}: ${(error as Error).message}`);
          }
        }

        if (page.page?.next) {
          try {
            const nextUrl = new URL(page.page.next);
            lastNextCursor = nextUrl.searchParams.get('cursor');
          } catch {
            lastNextCursor = null;
          }
        }
      }

      savedImport.nextCursor = lastNextCursor;
      savedImport.status = InvoiceImportStatus.SUCCESS;
      await this.eventsImportRepo.save(savedImport);

      this.logger.log('InvoiceEventsImporterJob Finalizado');
    } catch (error) {
      savedImport.status = InvoiceImportStatus.ERROR;
      await this.eventsImportRepo.save(savedImport);
      this.logger.error(`InvoiceEventsImporterJob falhou: ${(error as Error).message}`);
      throw error;
    }
  }
}
