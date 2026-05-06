import { NotaFiscal } from '@context/nfe-legacy/domain/entities/nota-fiscal.entity';
import { NfDocumentSnapshot } from '@context/nfe-legacy/domain/read-models/nota-fiscal.read-model';

export function toNfDocumentSnapshot(nf: NotaFiscal): NfDocumentSnapshot {
  return {
    id: nf.id,
    chaveAcesso: nf.chaveAcesso,
    numero: nf.numero,
    serie: nf.serie,
    modelo: nf.modelo,
    status: String(nf.status),
    source: String(nf.source),
    valorTotalNf: nf.valorTotalNf.toString(),
    valorTotalProdutos: nf.valorTotalProdutos.toString(),
  };
}
