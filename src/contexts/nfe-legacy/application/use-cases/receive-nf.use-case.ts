import { Injectable } from '@nestjs/common';
import { NfReceiverService } from '@context/ingestion/application/services/nf-receiver.service';
import { ReceiveNfDto } from '@context/ingestion/application/dto/receive-nf.dto';
import { AuditLogService } from '@context/nfe-legacy/application/services/audit-log.service';

@Injectable()
export class ReceiveNfUseCase {
  constructor(
    private readonly nfReceiverService: NfReceiverService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(
    dto: ReceiveNfDto,
    audit?: { userSub?: string },
  ): Promise<Awaited<ReturnType<NfReceiverService['receive']>>> {
    const result = await this.nfReceiverService.receive(dto);
    this.auditLogService.log({
      action: 'nf.submit',
      subject: result.chaveAcesso,
      userSub: audit?.userSub,
      metadata: { alreadyProcessed: result.alreadyProcessed, status: result.status },
    });
    return result;
  }
}
