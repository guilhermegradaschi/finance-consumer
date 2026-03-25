import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';
import { NfSource } from '../../../common/enums/nf-source.enum';

@Entity('nf_processing_log')
export class NfProcessingLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid', nullable: true })
  notaFiscalId!: string | null;

  @Column({ name: 'chave_acesso', type: 'varchar', length: 44 })
  chaveAcesso!: string;

  @Column({ type: 'varchar', length: 50 })
  stage!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'enum', enum: NfSource, nullable: true })
  source!: NfSource | null;

  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null;

  @Column({ name: 'attempt_number', type: 'smallint', default: 1 })
  attemptNumber!: number;

  @Column({ name: 'trace_id', type: 'varchar', length: 64, nullable: true })
  traceId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => NotaFiscal, (nf) => nf.processingLogs, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal!: NotaFiscal | null;
}
