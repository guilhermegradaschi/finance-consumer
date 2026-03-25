import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

@Entity('nf_pagamento')
export class NfPagamento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid' })
  notaFiscalId!: string;

  @Column({ name: 'forma_pagamento', type: 'varchar', length: 2 })
  formaPagamento!: string;

  @Column({
    type: 'decimal', precision: 15, scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valor!: number;

  @Column({ name: 'tipo_integracao', type: 'smallint', nullable: true })
  tipoIntegracao!: number | null;

  @Column({ name: 'cnpj_credenciadora', type: 'varchar', length: 14, nullable: true })
  cnpjCredenciadora!: string | null;

  @Column({ name: 'bandeira_cartao', type: 'varchar', length: 2, nullable: true })
  bandeiraCartao!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  autorizacao!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => NotaFiscal, (nf) => nf.pagamentos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal!: NotaFiscal;
}
