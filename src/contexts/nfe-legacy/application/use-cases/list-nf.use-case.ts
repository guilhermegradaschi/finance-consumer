import { Injectable } from '@nestjs/common';
import { NotaFiscalRepository } from '@context/nfe-legacy/domain/repositories/nota-fiscal.repository';
import { NfStatus } from '@context/nfe-legacy/domain/enums/nf-status.enum';
import { NfSource } from '@shared/enums/nf-source.enum';
import { AuditLogService } from '@context/nfe-legacy/application/services/audit-log.service';

export interface ListNfQuery {
  status?: NfStatus;
  source?: NfSource;
  cnpjEmitente?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListNfUseCase {
  constructor(
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(query: ListNfQuery, audit?: { userSub?: string }) {
    const result = await this.notaFiscalRepository.findWithFilters({
      status: query.status,
      source: query.source,
      cnpjEmitente: query.cnpjEmitente,
      page: query.page,
      limit: query.limit,
    });
    this.auditLogService.log({
      action: 'nf.list',
      userSub: audit?.userSub,
      metadata: { page: query.page ?? 1, limit: query.limit ?? 20, total: result.total },
    });
    return result;
  }
}
