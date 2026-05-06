export interface NfProcessedEventDto {
  chaveAcesso: string;
  idempotencyKey: string;
  xmlS3Key: string;
  numero: number;
  serie: number;
  modelo: string;
  dataEmissao: string;
  naturezaOperacao: string;
  tipoOperacao: number;
  valorTotalProdutos: number;
  valorTotalNf: number;
  emitente: {
    cnpj: string;
    razaoSocial: string;
    uf?: string;
  };
  destinatario: {
    cnpj?: string;
    cpf?: string;
    razaoSocial: string;
  };
  itens: Array<{
    numeroItem: number;
    codigoProduto: string;
    descricao: string;
    ncm: string;
    cfop: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }>;
  source: string;
  processedAt: string;
}
