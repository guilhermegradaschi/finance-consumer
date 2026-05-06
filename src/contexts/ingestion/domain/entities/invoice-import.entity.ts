import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { InvoiceImportStatus } from '@context/ingestion/domain/enums/invoice-import-status.enum';
import { ExternalInvoiceSource } from '@context/invoice/domain/enums/external-invoice-source.enum';
import { InvoiceImportLog } from '@context/ingestion/domain/entities/invoice-import-log.entity';
import { ExternalInvoice } from '@context/invoice/domain/entities/external-invoice.entity';

@Entity('invoice_imports')
export class InvoiceImport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'filter_start', type: 'timestamptz' })
  filterStart!: Date;

  @Column({ name: 'filter_end', type: 'timestamptz' })
  filterEnd!: Date;

  @Column({ type: 'smallint', default: ExternalInvoiceSource.QIVE })
  source!: ExternalInvoiceSource;

  @Column({ type: 'smallint', default: InvoiceImportStatus.PENDING })
  status!: InvoiceImportStatus;

  @Column({ type: 'boolean', default: true })
  automatic!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => InvoiceImportLog, (log) => log.invoiceImport, { cascade: true })
  logs!: InvoiceImportLog[];

  @OneToMany(() => ExternalInvoice, (ei) => ei.invoiceImport)
  externalInvoices!: ExternalInvoice[];
}
