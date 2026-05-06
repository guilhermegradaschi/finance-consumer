import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ExternalInvoiceStatus } from '@context/invoice/domain/enums/external-invoice-status.enum';
import { ExternalInvoiceSource } from '@context/invoice/domain/enums/external-invoice-source.enum';
import { ExternalInvoiceOperation } from '@context/invoice/domain/enums/external-invoice-operation.enum';
import { InvoiceImport } from '@context/ingestion/domain/entities/invoice-import.entity';
import { Invoice } from '@context/invoice/domain/entities/invoice.entity';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string) => (value ? parseFloat(value) : 0),
};

@Entity('external_invoices')
@Index('idx_external_invoices_status', ['status'])
@Index('idx_external_invoices_date', ['date'])
@Index('idx_external_invoices_operation', ['operation'])
export class ExternalInvoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'access_key', type: 'varchar', length: 44, unique: true })
  accessKey!: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 20 })
  invoiceNumber!: string;

  @Column({ type: 'timestamptz' })
  date!: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  value!: number;

  @Column({ name: 'delivery_date', type: 'timestamptz', nullable: true })
  deliveryDate!: Date | null;

  @Column({ name: 'order_number', type: 'varchar', length: 100, nullable: true })
  orderNumber!: string | null;

  @Column({ name: 'buyer_cnpj', type: 'varchar', length: 14 })
  buyerCnpj!: string;

  @Column({ name: 'seller_cnpj', type: 'varchar', length: 14 })
  sellerCnpj!: string;

  @Column({ name: 'buyer_name', type: 'varchar', length: 255, nullable: true })
  buyerName!: string | null;

  @Column({ name: 'code_operation', type: 'varchar', length: 10, nullable: true })
  codeOperation!: string | null;

  @Column({ type: 'varchar', length: 50, default: ExternalInvoiceOperation.VENDA })
  operation!: ExternalInvoiceOperation;

  @Column({ type: 'smallint', default: ExternalInvoiceSource.QIVE })
  source!: ExternalInvoiceSource;

  @Column({ type: 'smallint', default: ExternalInvoiceStatus.PENDING })
  status!: ExternalInvoiceStatus;

  @Column({ type: 'varchar', length: 512, nullable: true })
  filename!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'invoice_import_id', type: 'uuid', nullable: true })
  invoiceImportId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => InvoiceImport, (imp) => imp.externalInvoices, { nullable: true })
  @JoinColumn({ name: 'invoice_import_id' })
  invoiceImport!: InvoiceImport | null;

  @OneToMany(() => Invoice, (inv) => inv.externalInvoice)
  invoices!: Invoice[];
}
