import { HttpStatus } from '@nestjs/common';

export interface ErrorCodeEntry {
  code: string;
  message: string;
  httpStatus: number;
}

export const ERROR_CODES: Record<string, ErrorCodeEntry> = {
  XML_INVALID: {
    code: 'NF001',
    message: 'XML inválido ou malformado',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  XML_XSD_VALIDATION_FAILED: {
    code: 'NF002',
    message: 'XML não passou na validação XSD',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  CHAVE_ACESSO_INVALID: {
    code: 'NF003',
    message: 'Chave de acesso inválida',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  NF_DUPLICATE: {
    code: 'NF004',
    message: 'Nota Fiscal já processada (duplicata)',
    httpStatus: HttpStatus.CONFLICT,
  },
  NF_NOT_FOUND: {
    code: 'NF005',
    message: 'Nota Fiscal não encontrada',
    httpStatus: HttpStatus.NOT_FOUND,
  },
  CNPJ_INVALID: {
    code: 'NF006',
    message: 'CNPJ do emitente inválido',
    httpStatus: HttpStatus.BAD_REQUEST,
  },
  SEFAZ_UNAVAILABLE: {
    code: 'NF007',
    message: 'Serviço SEFAZ indisponível',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
  },
  RECEITA_WS_UNAVAILABLE: {
    code: 'NF008',
    message: 'Serviço ReceitaWS indisponível',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
  },
  S3_UPLOAD_FAILED: {
    code: 'NF009',
    message: 'Falha ao fazer upload do XML para S3',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
  },
  PERSISTENCE_FAILED: {
    code: 'NF010',
    message: 'Falha ao persistir dados da NF',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
  },
  INTERNAL_ERROR: {
    code: 'NF999',
    message: 'Erro interno do sistema',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
  },
} as const;
