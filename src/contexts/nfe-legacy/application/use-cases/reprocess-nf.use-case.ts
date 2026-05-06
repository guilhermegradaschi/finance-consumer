import { Injectable } from '@nestjs/common';
import { NotaFiscalRepository } from '@context/nfe-legacy/domain/repositories/nota-fiscal.repository';
import { S3Service } from '@infra/s3/s3.service';
import { NfReceiverService } from '@context/ingestion/application/services/nf-receiver.service';
import { IdempotencyService } from '@infra/redis/idempotency.service';
import { NfNotFoundException } from '@shared/exceptions/nf-not-found.exception';
import { AuditLogService } from '@context/nfe-legacy/application/services/audit-log.service';
import { toNfDocumentSnapshot } from '@context/nfe-legacy/domain/mappers/nota-fiscal.mapper';

@Injectable()
export class ReprocessNfUseCase {
  constructor(
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly s3Service: S3Service,
    private readonly nfReceiverService: NfReceiverService,
    private readonly idempotencyService: IdempotencyService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(chaveAcesso: string, audit?: { userSub?: string }) {
    const nf = await this.notaFiscalRepository.findByChaveAcesso(chaveAcesso);
    if (!nf) {
      throw new NfNotFoundException(`NF-e ${chaveAcesso} not found`, { chaveAcesso });
    }
    if (!nf.xmlS3Key) {
      throw new NfNotFoundException(`XML not found for NF-e ${chaveAcesso}`, { chaveAcesso });
    }

    await this.idempotencyService.remove(nf.idempotencyKey);
    const xmlContent = await this.s3Service.download(nf.xmlS3Key);
    const result = await this.nfReceiverService.receive({ xmlContent, source: nf.source });

    this.auditLogService.log({
      action: 'nf.reprocess',
      subject: chaveAcesso,
      userSub: audit?.userSub,
      metadata: { snapshot: toNfDocumentSnapshot(nf), receiveStatus: result.status },
    });

    return result;
  }
}
