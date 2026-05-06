import { Injectable } from '@nestjs/common';
import { NotaFiscalRepository } from '@context/nfe-legacy/domain/repositories/nota-fiscal.repository';
import { AuditLogService } from '@context/nfe-legacy/application/services/audit-log.service';
import { toNfDocumentSnapshot } from '@context/nfe-legacy/domain/mappers/nota-fiscal.mapper';

@Injectable()
export class GetNfByIdUseCase {
  constructor(
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(chaveAcesso: string, audit?: { userSub?: string }) {
    const nf = await this.notaFiscalRepository.findByChaveAcesso(chaveAcesso);
    if (nf) {
      this.auditLogService.log({
        action: 'nf.get',
        subject: chaveAcesso,
        userSub: audit?.userSub,
        metadata: { snapshot: toNfDocumentSnapshot(nf) },
      });
    }
    return nf;
  }
}
