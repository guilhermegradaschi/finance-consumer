export interface NfPersistedEventDto {
  chaveAcesso: string;
  idempotencyKey: string;
  notaFiscalId: string;
  status: string;
  source: string;
  persistedAt: string;
}
