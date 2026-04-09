import { Injectable } from '@nestjs/common';
import { NfReceiverService } from '../../modules/nf-receiver/nf-receiver.service';
import { ReceiveNfDto } from '../../modules/nf-receiver/dto/receive-nf.dto';
import { AuditLogService } from '../audit-log.service';

@Injectable()
export class ReceiveNfUseCase {
  constructor(
    private readonly nfReceiverService: NfReceiverService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(dto: ReceiveNfDto, audit?: { userSub?: string }): Promise<Awaited<ReturnType<NfReceiverService['receive']>>> {
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
