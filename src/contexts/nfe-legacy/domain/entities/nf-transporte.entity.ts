import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { NotaFiscal } from '@context/nfe-legacy/domain/entities/nota-fiscal.entity';

@Entity('nf_transporte')
export class NfTransporte {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid', unique: true })
  notaFiscalId!: string;

  @Column({ name: 'modalidade_frete', type: 'smallint' })
  modalidadeFrete!: number;

  @Column({ name: 'cnpj_transportadora', type: 'varchar', length: 14, nullable: true })
  cnpjTransportadora!: string | null;

  @Column({ name: 'razao_social', type: 'varchar', length: 255, nullable: true })
  razaoSocial!: string | null;

  @Column({ name: 'inscricao_estadual', type: 'varchar', length: 20, nullable: true })
  inscricaoEstadual!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  endereco!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  municipio!: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  uf!: string | null;

  @Column({ name: 'placa_veiculo', type: 'varchar', length: 7, nullable: true })
  placaVeiculo!: string | null;

  @Column({ name: 'uf_veiculo', type: 'char', length: 2, nullable: true })
  ufVeiculo!: string | null;

  @Column({ name: 'quantidade_volumes', type: 'integer', nullable: true })
  quantidadeVolumes!: number | null;

  @Column({ name: 'especie_volumes', type: 'varchar', length: 60, nullable: true })
  especieVolumes!: string | null;

  @Column({
    name: 'peso_liquido',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
    transformer: { to: (v: number) => v, from: (v: string) => (v ? parseFloat(v) : null) },
  })
  pesoLiquido!: number | null;

  @Column({
    name: 'peso_bruto',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
    transformer: { to: (v: number) => v, from: (v: string) => (v ? parseFloat(v) : null) },
  })
  pesoBruto!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToOne(() => NotaFiscal, (nf) => nf.transporte, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal!: NotaFiscal;
}
