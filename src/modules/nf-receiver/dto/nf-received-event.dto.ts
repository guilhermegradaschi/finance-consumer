export interface NfReceivedEventDto {
  chaveAcesso: string;
  xmlContent: string;
  source: string;
  idempotencyKey: string;
  receivedAt: string;
  metadata?: Record<string, unknown>;
}
