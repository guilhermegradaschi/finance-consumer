import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { NfProcessingLog } from '@context/nfe-legacy/domain/entities/nf-processing-log.entity';
import { NfSource } from '@shared/enums/nf-source.enum';

export interface NfAuditItem {
  chaveAcesso: string;
  lastStage: string;
  lastStatus: string;
  errorCode: string | null;
  errorMessage: string | null;
  source: NfSource | null;
  firstReceiveAt: Date | null;
  lastEventAt: Date;
  attemptCount: number;
  everReceivedSuccessfully: boolean;
  lastReceiveOutcome: string | null;
  currentPipelineStatus: string;
  hasNotaFiscal: boolean;
  notaFiscalStatus: string | null;
  notaFiscalCreatedAt: Date | null;
  notaFiscalProcessedAt: Date | null;
}

export interface NfAuditFilters {
  stage?: string;
  status?: string;
  source?: NfSource;
  page?: number;
  limit?: number;
}

export interface NfAuditEventsFilters {
  stage?: string;
  status?: string;
  source?: NfSource;
  chaveAcesso?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface NfAuditEvent {
  id: string;
  notaFiscalId: string | null;
  chaveAcesso: string;
  stage: string;
  status: string;
  source: NfSource | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  attemptNumber: number;
  traceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

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

  async findFailedNfs(filters: NfAuditFilters): Promise<{ data: NfAuditItem[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    const filterConditions: string[] = [];

    if (filters.stage) {
      params.push(filters.stage);
      filterConditions.push(`stage = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      filterConditions.push(`status = $${params.length}`);
    }
    if (filters.source) {
      params.push(filters.source);
      filterConditions.push(`source = $${params.length}`);
    }

    const hasFilters = filterConditions.length > 0;
    const matchingCte = hasFilters
      ? `matching_chaves AS (
          SELECT DISTINCT chave_acesso
          FROM nf_processing_log
          WHERE ${filterConditions.join(' AND ')}
        ),`
      : '';
    const matchingJoin = hasFilters ? 'JOIN matching_chaves mc ON mc.chave_acesso = agg.chave_acesso' : '';

    const baseQuery = `
      WITH ${matchingCte}
      agg AS (
        SELECT
          chave_acesso,
          MIN(created_at) FILTER (WHERE stage = 'RECEIVE') AS first_receive_at,
          MAX(created_at) AS last_event_at,
          COUNT(*) AS attempt_count,
          BOOL_OR(stage = 'RECEIVE' AND status = 'SUCCESS') AS ever_received_successfully
        FROM nf_processing_log
        GROUP BY chave_acesso
      ),
      last_global AS (
        SELECT DISTINCT ON (chave_acesso)
          chave_acesso, stage, status, error_code, error_message, source
        FROM nf_processing_log
        ORDER BY chave_acesso, created_at DESC
      ),
      last_receive AS (
        SELECT DISTINCT ON (chave_acesso)
          chave_acesso, status AS last_receive_outcome
        FROM nf_processing_log
        WHERE stage = 'RECEIVE'
        ORDER BY chave_acesso, created_at DESC
      )
      SELECT
        agg.chave_acesso AS "chaveAcesso",
        last_global.stage AS "lastStage",
        last_global.status AS "lastStatus",
        last_global.error_code AS "errorCode",
        last_global.error_message AS "errorMessage",
        last_global.source,
        agg.first_receive_at AS "firstReceiveAt",
        agg.last_event_at AS "lastEventAt",
        agg.attempt_count AS "attemptCount",
        agg.ever_received_successfully AS "everReceivedSuccessfully",
        last_receive.last_receive_outcome AS "lastReceiveOutcome",
        CASE WHEN nf.id IS NOT NULL THEN nf.status::text
             ELSE last_global.stage || ':' || last_global.status
        END AS "currentPipelineStatus",
        CASE WHEN nf.id IS NOT NULL THEN true ELSE false END AS "hasNotaFiscal",
        nf.status AS "notaFiscalStatus",
        nf.created_at AS "notaFiscalCreatedAt",
        nf.processed_at AS "notaFiscalProcessedAt"
      FROM agg
      JOIN last_global ON last_global.chave_acesso = agg.chave_acesso
      LEFT JOIN last_receive ON last_receive.chave_acesso = agg.chave_acesso
      LEFT JOIN nota_fiscal nf ON nf.chave_acesso = agg.chave_acesso
      ${matchingJoin}
    `;

    const countParams = [...params];
    const countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) sub`;
    const countResult = await this.query(countQuery, countParams);
    const total = parseInt(countResult[0]?.total ?? '0', 10);

    params.push(limit, offset);
    const dataQuery = `${baseQuery} ORDER BY agg.last_event_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const data: NfAuditItem[] = await this.query(dataQuery, params);

    for (const row of data) {
      row.attemptCount = Number(row.attemptCount);
      row.hasNotaFiscal = row.hasNotaFiscal === true || (row.hasNotaFiscal as unknown) === 't';
      row.everReceivedSuccessfully =
        row.everReceivedSuccessfully === true || (row.everReceivedSuccessfully as unknown) === 't';
    }

    return { data, total };
  }

  async findAuditEvents(filters: NfAuditEventsFilters): Promise<{ data: NfAuditEvent[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.stage) {
      params.push(filters.stage);
      conditions.push(`stage = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.source) {
      params.push(filters.source);
      conditions.push(`source = $${params.length}`);
    }
    if (filters.chaveAcesso) {
      params.push(filters.chaveAcesso);
      conditions.push(`chave_acesso = $${params.length}`);
    }
    if (filters.dateFrom) {
      params.push(filters.dateFrom);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (filters.dateTo) {
      params.push(filters.dateTo);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countParams = [...params];
    const countQuery = `SELECT COUNT(*) AS total FROM nf_processing_log ${whereClause}`;
    const countResult = await this.query(countQuery, countParams);
    const total = parseInt(countResult[0]?.total ?? '0', 10);

    params.push(limit, offset);
    const dataQuery = `
      SELECT
        id, nota_fiscal_id AS "notaFiscalId", chave_acesso AS "chaveAcesso",
        stage, status, source, error_code AS "errorCode",
        error_message AS "errorMessage", duration_ms AS "durationMs",
        attempt_number AS "attemptNumber", trace_id AS "traceId",
        metadata, created_at AS "createdAt"
      FROM nf_processing_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const data: NfAuditEvent[] = await this.query(dataQuery, params);

    return { data, total };
  }
}
