import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  Index,
} from 'typeorm';
import { NfItem } from './nf-item.entity';
import { NfEmitente } from './nf-emitente.entity';
import { NfDestinatario } from './nf-destinatario.entity';
import { NfTransporte } from './nf-transporte.entity';
import { NfPagamento } from './nf-pagamento.entity';
import { NfProcessingLog } from './nf-processing-log.entity';
import { NfStatus } from '../../../common/enums/nf-status.enum';
import { NfSource } from '../../../common/enums/nf-source.enum';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

@Entity('nota_fiscal')
@Index('idx_nota_fiscal_status', ['status'])
@Index('idx_nota_fiscal_data_emissao', ['dataEmissao'])
@Index('idx_nota_fiscal_numero_serie', ['numero', 'serie'])
export class NotaFiscal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'chave_acesso', type: 'varchar', length: 44, unique: true })
  chaveAcesso!: string;

  @Column({ type: 'integer' })
  numero!: number;

  @Column({ type: 'smallint', default: 1 })
  serie!: number;

  @Column({ type: 'enum', enum: ['55', '65'], default: '55' })
  modelo!: string;

  @Column({ name: 'data_emissao', type: 'timestamptz' })
  dataEmissao!: Date;

  @Column({ name: 'data_entrada_saida', type: 'timestamptz', nullable: true })
  dataEntradaSaida!: Date | null;

  @Column({ name: 'natureza_operacao', type: 'varchar', length: 255 })
  naturezaOperacao!: string;

  @Column({ name: 'tipo_operacao', type: 'smallint' })
  tipoOperacao!: number;

  @Column({ name: 'valor_total_produtos', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorTotalProdutos!: number;

  @Column({ name: 'valor_total_nf', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorTotalNf!: number;

  @Column({ name: 'valor_desconto', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorDesconto!: number;

  @Column({ name: 'valor_frete', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorFrete!: number;

  @Column({ name: 'valor_seguro', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorSeguro!: number;

  @Column({ name: 'valor_icms', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorIcms!: number;

  @Column({ name: 'valor_ipi', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorIpi!: number;

  @Column({ name: 'valor_pis', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorPis!: number;

  @Column({ name: 'valor_cofins', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  valorCofins!: number;

  @Column({ name: 'informacoes_complementares', type: 'text', nullable: true })
  informacoesComplementares!: string | null;

  @Column({ type: 'enum', enum: NfStatus, default: NfStatus.RECEIVED })
  status!: NfStatus;

  @Column({ type: 'enum', enum: NfSource })
  source!: NfSource;

  @Column({ name: 'xml_s3_key', type: 'varchar', length: 512, nullable: true })
  xmlS3Key!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'protocolo_autorizacao', type: 'varchar', length: 20, nullable: true })
  protocoloAutorizacao!: string | null;

  @Column({ name: 'data_autorizacao', type: 'timestamptz', nullable: true })
  dataAutorizacao!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount!: number;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @OneToMany(() => NfItem, (item) => item.notaFiscal, { cascade: true })
  itens!: NfItem[];

  @OneToOne(() => NfEmitente, (emitente) => emitente.notaFiscal, { cascade: true })
  emitente!: NfEmitente;

  @OneToOne(() => NfDestinatario, (destinatario) => destinatario.notaFiscal, { cascade: true })
  destinatario!: NfDestinatario;

  @OneToOne(() => NfTransporte, (transporte) => transporte.notaFiscal, { cascade: true })
  transporte!: NfTransporte;

  @OneToMany(() => NfPagamento, (pagamento) => pagamento.notaFiscal, { cascade: true })
  pagamentos!: NfPagamento[];

  @OneToMany(() => NfProcessingLog, (log) => log.notaFiscal)
  processingLogs!: NfProcessingLog[];
}
