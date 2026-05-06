import { BusinessException } from '@shared/exceptions/base.exception';

export class NfNotFoundException extends BusinessException {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NF404', context);
  }
}
