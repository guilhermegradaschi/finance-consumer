import { BusinessException } from './base.exception';

export class NonRetryableException extends BusinessException {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
  }
}
