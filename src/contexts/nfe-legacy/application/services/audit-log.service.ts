import { Injectable, Logger } from '@nestjs/common';
import { getCorrelationId } from '@shared/correlation/correlation-context';

export type AuditAction =
  | 'nf.submit'
  | 'nf.list'
  | 'nf.summary'
  | 'nf.get'
  | 'nf.logs'
  | 'nf.timeline'
  | 'nf.audit'
  | 'nf.audit.events'
  | 'nf.reprocess'
  | 'auth.revoke'
  | 'auth.token';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('Audit');

  log(entry: { action: AuditAction; subject?: string; userSub?: string; metadata?: Record<string, unknown> }): void {
    const correlationId = getCorrelationId();
    this.logger.log(
      JSON.stringify({
        type: 'audit',
        action: entry.action,
        subject: entry.subject,
        userSub: entry.userSub,
        correlationId,
        metadata: entry.metadata,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
