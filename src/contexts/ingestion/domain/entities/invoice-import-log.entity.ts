import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InvoiceImportLogStatus } from '@context/ingestion/domain/enums/invoice-import-log-status.enum';
import { InvoiceImport } from '@context/ingestion/domain/entities/invoice-import.entity';

@Entity('invoice_import_logs')
export class InvoiceImportLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'invoice_import_id', type: 'uuid' })
  invoiceImportId!: string;

  @Column({ type: 'smallint', default: InvoiceImportLogStatus.SUCCESS })
  status!: InvoiceImportLogStatus;

  @Column({ type: 'jsonb', default: {} })
  log!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => InvoiceImport, (imp) => imp.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_import_id' })
  invoiceImport!: InvoiceImport;
}
