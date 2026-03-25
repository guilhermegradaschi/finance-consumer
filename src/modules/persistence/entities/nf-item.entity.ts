import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

const dec = (v: string) => parseFloat(v);
const decTransformer = { to: (v: number) => v, from: dec };

@Entity('nf_item')
@Unique('idx_nf_item_unique', ['notaFiscalId', 'numeroItem'])
export class NfItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid' })
  notaFiscalId!: string;

  @Column({ name: 'numero_item', type: 'smallint' })
  numeroItem!: number;

  @Column({ name: 'codigo_produto', type: 'varchar', length: 60 })
  codigoProduto!: string;

  @Column({ type: 'varchar', length: 14, nullable: true })
  ean!: string | null;

  @Column({ type: 'varchar', length: 500 })
  descricao!: string;

  @Column({ type: 'varchar', length: 8 })
  ncm!: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cest!: string | null;

  @Column({ type: 'varchar', length: 4 })
  cfop!: string;

  @Column({ name: 'unidade_comercial', type: 'varchar', length: 6 })
  unidadeComercial!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, transformer: decTransformer })
  quantidade!: number;

  @Column({ name: 'valor_unitario', type: 'decimal', precision: 21, scale: 10, transformer: decTransformer })
  valorUnitario!: number;

  @Column({ name: 'valor_total', type: 'decimal', precision: 15, scale: 2, transformer: decTransformer })
  valorTotal!: number;

  @Column({ name: 'valor_desconto', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decTransformer })
  valorDesconto!: number;

  @Column({ name: 'valor_icms', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decTransformer })
  valorIcms!: number;

  @Column({ name: 'aliquota_icms', type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decTransformer })
  aliquotaIcms!: number;

  @Column({ name: 'valor_ipi', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decTransformer })
  valorIpi!: number;

  @Column({ name: 'aliquota_ipi', type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decTransformer })
  aliquotaIpi!: number;

  @Column({ name: 'valor_pis', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decTransformer })
  valorPis!: number;

  @Column({ name: 'valor_cofins', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decTransformer })
  valorCofins!: number;

  @Column({ name: 'cst_icms', type: 'varchar', length: 3, nullable: true })
  cstIcms!: string | null;

  @Column({ name: 'cst_ipi', type: 'varchar', length: 2, nullable: true })
  cstIpi!: string | null;

  @Column({ name: 'cst_pis', type: 'varchar', length: 2, nullable: true })
  cstPis!: string | null;

  @Column({ name: 'cst_cofins', type: 'varchar', length: 2, nullable: true })
  cstCofins!: string | null;

  @Column({ name: 'informacoes_adicionais', type: 'text', nullable: true })
  informacoesAdicionais!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => NotaFiscal, (nf) => nf.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal!: NotaFiscal;
}
