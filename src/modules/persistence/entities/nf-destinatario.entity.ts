import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

@Entity('nf_destinatario')
export class NfDestinatario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid', unique: true })
  notaFiscalId!: string;

  @Column({ type: 'varchar', length: 14, nullable: true })
  cnpj!: string | null;

  @Column({ type: 'varchar', length: 11, nullable: true })
  cpf!: string | null;

  @Column({ name: 'razao_social', type: 'varchar', length: 255 })
  razaoSocial!: string;

  @Column({ name: 'inscricao_estadual', type: 'varchar', length: 20, nullable: true })
  inscricaoEstadual!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logradouro!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  numero!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  complemento!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bairro!: string | null;

  @Column({ name: 'codigo_municipio', type: 'varchar', length: 7, nullable: true })
  codigoMunicipio!: string | null;

  @Column({ name: 'nome_municipio', type: 'varchar', length: 100, nullable: true })
  nomeMunicipio!: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  uf!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  cep!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone!: string | null;

  @Column({ name: 'indicador_ie', type: 'smallint', nullable: true })
  indicadorIe!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToOne(() => NotaFiscal, (nf) => nf.destinatario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal!: NotaFiscal;
}
