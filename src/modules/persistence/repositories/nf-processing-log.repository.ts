import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { NfProcessingLog } from '../entities/nf-processing-log.entity';
import { NfSource } from '../../../common/enums/nf-source.enum';

@Injectable()
export class NfProcessingLogRepository extends Repository<NfProcessingLog> {
  constructor(private dataSource: DataSource) {
    super(NfProcessingLog, dataSource.createEntityManager());
  }

  async logProcessingStep(params: {
    notaFiscalId?: string;
    chaveAcesso: string;
    stage: string;
    status: string;
    source?: NfSource;
    errorCode?: string;
    errorMessage?: string;
    durationMs?: number;
    attemptNumber?: number;
    traceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<NfProcessingLog> {
    const log = this.create({
      notaFiscalId: params.notaFiscalId ?? null,
      chaveAcesso: params.chaveAcesso,
      stage: params.stage,
      status: params.status,
      source: params.source ?? null,
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage ?? null,
      durationMs: params.durationMs ?? null,
      attemptNumber: params.attemptNumber ?? 1,
      traceId: params.traceId ?? null,
      metadata: params.metadata ?? {},
    });
    return this.save(log);
  }

  async getLogsByChaveAcesso(chaveAcesso: string): Promise<NfProcessingLog[]> {
    return this.find({
      where: { chaveAcesso },
      order: { createdAt: 'ASC' },
    });
  }

  async getFailedLogs(limit = 100): Promise<NfProcessingLog[]> {
    return this.find({
      where: { status: 'ERROR' },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
