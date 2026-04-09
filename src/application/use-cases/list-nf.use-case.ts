import { Injectable } from '@nestjs/common';
import { NotaFiscalRepository } from '../../modules/persistence/repositories/nota-fiscal.repository';
import { NfStatus } from '../../common/enums/nf-status.enum';
import { NfSource } from '../../common/enums/nf-source.enum';
import { AuditLogService } from '../audit-log.service';

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
