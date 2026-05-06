export interface XmlMetadataDto {
  chaveAcesso: string;
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
    nomeFantasia?: string;
    inscricaoEstadual?: string;
    uf?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    codigoMunicipio?: string;
    nomeMunicipio?: string;
    cep?: string;
  };
  destinatario: {
    cnpj?: string;
    cpf?: string;
    razaoSocial: string;
    inscricaoEstadual?: string;
    email?: string;
    uf?: string;
  };
  itens: Array<{
    numeroItem: number;
    codigoProduto: string;
    descricao: string;
    ncm: string;
    cfop: string;
    unidadeComercial: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }>;
  transporte?: {
    modalidadeFrete: number;
  };
  pagamentos: Array<{
    formaPagamento: string;
    valor: number;
  }>;
}
