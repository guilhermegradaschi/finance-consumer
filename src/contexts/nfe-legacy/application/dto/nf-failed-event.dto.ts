export interface NfFailedEventDto {
  chaveAcesso: string;
  idempotencyKey: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
  retryCount: number;
  source: string;
  failedAt: string;
}
