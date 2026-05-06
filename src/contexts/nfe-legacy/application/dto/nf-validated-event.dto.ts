export interface NfValidatedEventDto {
  chaveAcesso: string;
  idempotencyKey: string;
  cnpjValidation: {
    cnpj: string;
    valid: boolean;
    razaoSocial?: string;
  };
  sefazValidation: {
    valid: boolean;
    protocoloAutorizacao?: string;
    dataAutorizacao?: string;
  };
  processedData: Record<string, unknown>;
  source: string;
  validatedAt: string;
}
