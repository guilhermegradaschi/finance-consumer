export interface ValidationResultDto {
  cnpjValidation: {
    cnpj: string;
    valid: boolean;
    razaoSocial?: string;
    situacao?: string;
  };
  sefazValidation: {
    valid: boolean;
    protocoloAutorizacao?: string;
    dataAutorizacao?: string;
    status?: string;
  };
  isValid: boolean;
  errors: string[];
}
