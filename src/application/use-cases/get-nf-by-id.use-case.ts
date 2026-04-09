import { Injectable } from '@nestjs/common';
import { NotaFiscalRepository } from '../../modules/persistence/repositories/nota-fiscal.repository';
import { AuditLogService } from '../audit-log.service';
import { toNfDocumentSnapshot } from '../../domain/mappers/nota-fiscal.mapper';

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
