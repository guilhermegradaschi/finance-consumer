export interface NfReceivedEventDto {
  chaveAcesso: string;
  xmlContent?: string;
  source: string;
  idempotencyKey: string;
  receivedAt: string;
  metadata?: Record<string, unknown>;
  ingestionId?: string;
  rawStorageKey?: string;
  correlationId?: string;
  checksumSha256?: string;
  preUploadedToS3?: boolean;
}
