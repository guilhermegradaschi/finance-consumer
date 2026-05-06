import { Injectable } from '@nestjs/common';
import { NotaFiscalRepository } from '@context/nfe-legacy/domain/repositories/nota-fiscal.repository';
import { AuditLogService } from '@context/nfe-legacy/application/services/audit-log.service';

@Injectable()
export class GetNfSummaryUseCase {
  constructor(
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(audit?: { userSub?: string }) {
    const summary = await this.notaFiscalRepository.getStatusSummary();
    this.auditLogService.log({ action: 'nf.summary', userSub: audit?.userSub });
    return summary;
  }
}
