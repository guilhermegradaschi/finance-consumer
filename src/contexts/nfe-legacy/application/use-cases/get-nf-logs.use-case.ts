import { Injectable } from '@nestjs/common';
import { NfProcessingLogRepository } from '@context/nfe-legacy/domain/repositories/nf-processing-log.repository';
import { AuditLogService } from '@context/nfe-legacy/application/services/audit-log.service';

@Injectable()
export class GetNfLogsUseCase {
  constructor(
    private readonly processingLogRepository: NfProcessingLogRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(chaveAcesso: string, audit?: { userSub?: string }) {
    const logs = await this.processingLogRepository.getLogsByChaveAcesso(chaveAcesso);
    this.auditLogService.log({
      action: 'nf.logs',
      subject: chaveAcesso,
      userSub: audit?.userSub,
      metadata: { logCount: logs.length },
    });
    return logs;
  }
}
