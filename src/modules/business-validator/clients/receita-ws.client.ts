import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RetryableException } from '../../../common/exceptions/retryable.exception';

export interface CnpjValidationResult {
  cnpj: string;
  valid: boolean;
  razaoSocial?: string;
  situacao?: string;
}

@Injectable()
export class ReceitaWsClient {
  private readonly logger = new Logger(ReceitaWsClient.name);
  private circuitOpen = false;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold = 5;
  private readonly resetTimeMs = 30000;

  constructor(private readonly httpService: HttpService) {}

  async validateCnpj(cnpj: string): Promise<CnpjValidationResult> {
    if (this.circuitOpen) {
      if (Date.now() - this.lastFailureTime > this.resetTimeMs) {
        this.circuitOpen = false;
        this.failureCount = 0;
      } else {
        this.logger.warn('ReceitaWS circuit breaker is OPEN');
        return { cnpj, valid: true, razaoSocial: 'Circuit breaker open - skipped', situacao: 'SKIPPED' };
      }
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`https://receitaws.com.br/v1/cnpj/${cnpj}`, { timeout: 10000 }),
      );

      const data = response.data as Record<string, string>;
      this.failureCount = 0;

      return {
        cnpj,
        valid: data.situacao === 'ATIVA',
        razaoSocial: data.nome,
        situacao: data.situacao,
      };
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.threshold) {
        this.circuitOpen = true;
        this.logger.error('ReceitaWS circuit breaker OPENED');
      }

      throw new RetryableException(
        `ReceitaWS unavailable: ${(error as Error).message}`,
        'NF008',
        { cnpj },
      );
    }
  }
}
