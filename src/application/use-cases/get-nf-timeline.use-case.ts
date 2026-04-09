import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NfProcessingLogRepository } from '../../modules/persistence/repositories/nf-processing-log.repository';
import { NotaFiscalRepository } from '../../modules/persistence/repositories/nota-fiscal.repository';
import { ExternalInvoice } from '../../modules/persistence/entities/external-invoice.entity';
import { Invoice } from '../../modules/persistence/entities/invoice.entity';
import { InvoiceEvent } from '../../modules/persistence/entities/invoice-event.entity';
import { InvoiceImportLog } from '../../modules/persistence/entities/invoice-import-log.entity';
import { AuditLogService } from '../audit-log.service';

export interface TimelineEntry {
  timestamp: Date;
  stage: string;
  status: string;
  source: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  attemptNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface NfTimelineResponse {
  chaveAcesso: string;
  currentStatus: string | null;
  firstSeen: Date | null;
  lastActivity: Date | null;
  totalDurationMs: number;
  entries: TimelineEntry[];
  summary: {
    totalSteps: number;
    successCount: number;
    errorCount: number;
    warningCount: number;
    duplicateCount: number;
  };
  relatedEntities: {
    notaFiscalId?: string;
    externalInvoiceId?: string;
    invoiceId?: string;
    invoiceImportId?: string;
  };
}

@Injectable()
export class GetNfTimelineUseCase {
  constructor(
    private readonly dataSource: DataSource,
    private readonly processingLogRepository: NfProcessingLogRepository,
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(chaveAcesso: string, audit?: { userSub?: string }): Promise<NfTimelineResponse | null> {
    const [processingLogs, notaFiscal, externalInvoice, invoice, invoiceEvents] = await Promise.all([
      this.processingLogRepository.getLogsByChaveAcesso(chaveAcesso),
      this.notaFiscalRepository.findOne({ where: { chaveAcesso } }),
      this.dataSource.getRepository(ExternalInvoice).findOne({
        where: { accessKey: chaveAcesso },
        relations: ['invoiceImport'],
      }),
      this.dataSource.getRepository(Invoice).findOne({ where: { accessKey: chaveAcesso } }),
      this.dataSource.getRepository(InvoiceEvent).find({
        where: { accessKey: chaveAcesso },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const hasAnyData = processingLogs.length > 0 || notaFiscal || externalInvoice || invoice || invoiceEvents.length > 0;
    if (!hasAnyData) {
      return null;
    }

    const entries: TimelineEntry[] = [];

    for (const log of processingLogs) {
      entries.push({
        timestamp: log.createdAt,
        stage: log.stage,
        status: log.status,
        source: 'nf-pipeline',
        durationMs: log.durationMs ?? undefined,
        errorCode: log.errorCode ?? undefined,
        errorMessage: log.errorMessage ?? undefined,
        attemptNumber: log.attemptNumber,
        metadata: log.metadata && Object.keys(log.metadata).length > 0 ? log.metadata : undefined,
      });
    }

    if (externalInvoice) {
      entries.push({
        timestamp: externalInvoice.createdAt,
        stage: 'EXTERNAL_INVOICE_CREATED',
        status: this.mapExternalInvoiceStatus(externalInvoice.status),
        source: 'finance-pipeline',
        errorMessage: externalInvoice.errorMessage ?? undefined,
        metadata: {
          externalInvoiceId: externalInvoice.id,
          source: externalInvoice.source,
          operation: externalInvoice.operation,
          invoiceNumber: externalInvoice.invoiceNumber,
          value: externalInvoice.value,
          buyerCnpj: externalInvoice.buyerCnpj,
          sellerCnpj: externalInvoice.sellerCnpj,
        },
      });

      if (externalInvoice.updatedAt.getTime() !== externalInvoice.createdAt.getTime()) {
        entries.push({
          timestamp: externalInvoice.updatedAt,
          stage: 'EXTERNAL_INVOICE_UPDATED',
          status: this.mapExternalInvoiceStatus(externalInvoice.status),
          source: 'finance-pipeline',
          errorMessage: externalInvoice.errorMessage ?? undefined,
          metadata: { externalInvoiceId: externalInvoice.id, currentStatus: externalInvoice.status },
        });
      }

      if (externalInvoice.invoiceImport) {
        const importLogs = await this.dataSource.getRepository(InvoiceImportLog).find({
          where: { invoiceImportId: externalInvoice.invoiceImport.id },
          order: { createdAt: 'ASC' },
        });

        for (const importLog of importLogs) {
          entries.push({
            timestamp: importLog.createdAt,
            stage: 'IMPORT_LOG',
            status: this.mapImportLogStatus(importLog.status),
            source: 'finance-pipeline',
            metadata: {
              invoiceImportId: importLog.invoiceImportId,
              log: importLog.log,
              ...importLog.metadata,
            },
          });
        }
      }
    }

    if (invoice) {
      entries.push({
        timestamp: invoice.createdAt,
        stage: 'INVOICE_CREATED',
        status: this.mapInvoiceStatus(invoice.status),
        source: 'finance-pipeline',
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          value: invoice.value,
          buyerId: invoice.buyerId,
          sellerId: invoice.sellerId,
          operation: invoice.operation,
          source: invoice.source,
        },
      });

      if (invoice.updatedAt.getTime() !== invoice.createdAt.getTime()) {
        entries.push({
          timestamp: invoice.updatedAt,
          stage: 'INVOICE_UPDATED',
          status: this.mapInvoiceStatus(invoice.status),
          source: 'finance-pipeline',
          metadata: { invoiceId: invoice.id, currentStatus: invoice.status },
        });
      }
    }

    for (const event of invoiceEvents) {
      entries.push({
        timestamp: event.createdAt,
        stage: `INVOICE_EVENT_${event.eventType.toUpperCase()}`,
        status: this.mapInvoiceEventStatus(event.status),
        source: 'finance-pipeline',
        errorMessage: event.errorMessage ?? undefined,
        metadata: {
          invoiceEventId: event.id,
          eventType: event.eventType,
          invoiceId: event.invoiceId,
          filename: event.filename,
        },
      });
    }

    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const firstSeen = entries.length > 0 ? entries[0].timestamp : null;
    const lastActivity = entries.length > 0 ? entries[entries.length - 1].timestamp : null;
    const totalDurationMs = firstSeen && lastActivity ? lastActivity.getTime() - firstSeen.getTime() : 0;

    const currentStatus = notaFiscal?.status
      ?? (invoice ? this.mapInvoiceStatus(invoice.status) : null)
      ?? (externalInvoice ? this.mapExternalInvoiceStatus(externalInvoice.status) : null);

    const summary = {
      totalSteps: entries.length,
      successCount: entries.filter((e) => e.status === 'SUCCESS' || e.status === 'PROCESSED').length,
      errorCount: entries.filter((e) => e.status === 'ERROR').length,
      warningCount: entries.filter((e) => e.status === 'WARNING').length,
      duplicateCount: entries.filter((e) => e.status === 'DUPLICATE').length,
    };

    const response: NfTimelineResponse = {
      chaveAcesso,
      currentStatus,
      firstSeen,
      lastActivity,
      totalDurationMs,
      entries,
      summary,
      relatedEntities: {
        notaFiscalId: notaFiscal?.id,
        externalInvoiceId: externalInvoice?.id,
        invoiceId: invoice?.id,
        invoiceImportId: externalInvoice?.invoiceImportId ?? undefined,
      },
    };

    this.auditLogService.log({
      action: 'nf.timeline',
      subject: chaveAcesso,
      userSub: audit?.userSub,
      metadata: { entryCount: entries.length, currentStatus },
    });

    return response;
  }

  private mapExternalInvoiceStatus(status: number): string {
    const map: Record<number, string> = { 0: 'PENDING', 1: 'PROCESSING', 2: 'PROCESSED', 3: 'ERROR' };
    return map[status] ?? `UNKNOWN(${status})`;
  }

  private mapInvoiceStatus(status: number): string {
    const map: Record<number, string> = { 0: 'ERROR', 1: 'PROCESSED', 2: 'CANCELED' };
    return map[status] ?? `UNKNOWN(${status})`;
  }

  private mapInvoiceEventStatus(status: number): string {
    const map: Record<number, string> = { 0: 'PENDING', 1: 'PROCESSED', 2: 'ERROR', 3: 'SKIPPED' };
    return map[status] ?? `UNKNOWN(${status})`;
  }

  private mapImportLogStatus(status: number): string {
    const map: Record<number, string> = { 0: 'SUCCESS', 5: 'IGNORED', 10: 'ERROR' };
    return map[status] ?? `UNKNOWN(${status})`;
  }
}
