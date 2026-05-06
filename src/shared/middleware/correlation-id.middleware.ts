import type { NextFunction, Request, Response } from 'express';
import {
  CORRELATION_HEADER,
  createCorrelationId,
  enterCorrelationContext,
} from '@shared/correlation/correlation-context';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers[CORRELATION_HEADER] ?? req.headers['x-correlation-id'];
  const correlationId = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : createCorrelationId();

  res.setHeader('X-Correlation-Id', correlationId);

  enterCorrelationContext(correlationId, () => next());
}
