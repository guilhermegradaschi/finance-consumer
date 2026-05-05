import { Injectable } from '@nestjs/common';
import { SubmitIngestionService, SubmitIngestionResult } from './submit-ingestion.service';
import { ReceiveNfDto } from './dto/receive-nf.dto';

export type ReceiveResult = SubmitIngestionResult;

@Injectable()
export class NfReceiverService {
  constructor(private readonly submitIngestionService: SubmitIngestionService) {}

  async receive(dto: ReceiveNfDto): Promise<ReceiveResult> {
    return this.submitIngestionService.submit(dto);
  }
}
