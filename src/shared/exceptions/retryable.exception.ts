import { InfrastructureException } from '@shared/exceptions/base.exception';

export class RetryableException extends InfrastructureException {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
  }
}
