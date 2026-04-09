import { HttpStatus } from '@nestjs/common';
import { BusinessException } from './base.exception';

export class NfNotFoundException extends BusinessException {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NF404', context, HttpStatus.NOT_FOUND);
  }
}
