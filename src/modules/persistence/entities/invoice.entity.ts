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
import { InvoiceStatus } from '../../../common/enums/invoice-status.enum';
import { InvoiceSource } from '../../../common/enums/invoice-source.enum';
import { InvoiceIgnoredReason } from '../../../common/enums/invoice-ignored-reason.enum';
import { ExternalInvoice } from './external-invoice.entity';
import { InvoiceItem } from './invoice-item.entity';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string) => (value ? parseFloat(value) : 0),
};

@Entity('invoices')
@Index('idx_invoices_access_key', ['accessKey'], { unique: true })
@Index('idx_invoices_status', ['status'])
@Index('idx_invoices_date', ['date'])
@Index('idx_invoices_buyer_seller', ['buyerId', 'sellerId'])
@Index('idx_invoices_reference_date', ['referenceDate'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 20 })
  invoiceNumber!: string;

  @Column({ type: 'date' })
  date!: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  value!: number;

  @Column({ name: 'access_key', type: 'varchar', length: 44, unique: true })
  accessKey!: string;

  @Column({ name: 'buyer_id', type: 'integer', nullable: true })
  buyerId!: number | null;

  @Column({ name: 'seller_id', type: 'integer', nullable: true })
  sellerId!: number | null;

  @Column({ name: 'reference_date', type: 'date', nullable: true })
  referenceDate!: Date | null;

  @Column({ name: 'uf_recipient', type: 'char', length: 2, nullable: true })
  ufRecipient!: string | null;

  @Column({ name: 'uf_sender', type: 'char', length: 2, nullable: true })
  ufSender!: string | null;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

  @Column({ type: 'smallint', default: InvoiceStatus.PROCESSED })
  status!: InvoiceStatus;

  @Column({ type: 'smallint', default: InvoiceSource.QIVE })
  source!: InvoiceSource;

  @Column({ name: 'ignored_reason', type: 'smallint', default: InvoiceIgnoredReason.NOT_IGNORED })
  ignoredReason!: InvoiceIgnoredReason;

  @Column({ type: 'varchar', length: 50, default: 'venda' })
  operation!: string;

  @Column({ name: 'code_operation', type: 'varchar', length: 10, nullable: true })
  codeOperation!: string | null;

  @Column({ name: 'icmsdeson_discount_value', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  icmsdesonDiscountValue!: number;

  @Column({ name: 'mp_net_value', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  mpNetValue!: number;

  @Column({ name: 'mp_gross_value', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  mpGrossValue!: number;

  @Column({ name: 'delivery_date', type: 'timestamptz', nullable: true })
  deliveryDate!: Date | null;

  @Column({ name: 'order_number', type: 'varchar', length: 100, nullable: true })
  orderNumber!: string | null;

  @Column({ name: 'buyer_association', type: 'varchar', length: 50, nullable: true })
  buyerAssociation!: string | null;

  @Column({ name: 'buyer_cnpj', type: 'varchar', length: 14, nullable: true })
  buyerCnpj!: string | null;

  @Column({ name: 'seller_cnpj', type: 'varchar', length: 14, nullable: true })
  sellerCnpj!: string | null;

  @Column({ name: 'external_invoice_id', type: 'uuid', nullable: true })
  externalInvoiceId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => ExternalInvoice, (ei) => ei.invoices, { nullable: true })
  @JoinColumn({ name: 'external_invoice_id' })
  externalInvoice!: ExternalInvoice | null;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items!: InvoiceItem[];
}
