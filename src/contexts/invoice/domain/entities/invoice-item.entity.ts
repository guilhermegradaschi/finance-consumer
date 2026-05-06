import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Invoice } from '@context/invoice/domain/entities/invoice.entity';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string) => (value ? parseFloat(value) : 0),
};

@Entity('invoice_items')
export class InvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @Column({ name: 'product_name', type: 'varchar', length: 500, nullable: true })
  productName!: string | null;

  @Column({ type: 'varchar', length: 14, nullable: true })
  ean!: string | null;

  @Column({ name: 'product_code', type: 'varchar', length: 60, nullable: true })
  productCode!: string | null;

  @Column({ name: 'unit_measure', type: 'varchar', length: 6, nullable: true })
  unitMeasure!: string | null;

  @Column({ name: 'net_value', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  netValue!: number;

  @Column({
    name: 'gross_value',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  grossValue!: number;

  @Column({ name: 'qtde_item', type: 'decimal', precision: 15, scale: 4, default: 0, transformer: decimalTransformer })
  qtdeItem!: number;

  @Column({
    name: 'unit_value',
    type: 'decimal',
    precision: 21,
    scale: 10,
    default: 0,
    transformer: decimalTransformer,
  })
  unitValue!: number;

  @Column({ name: 'desc_value', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  descValue!: number;

  @Column({ name: 'ipi_value', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  ipiValue!: number;

  @Column({
    name: 'icmsst_value',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  icmsstValue!: number;

  @Column({
    name: 'icmsdeson_value',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  icmsdesonValue!: number;

  @Column({
    name: 'fcpst_value',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  fcpstValue!: number;

  @Column({
    name: 'bc_icms_value',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  bcIcmsValue!: number;

  @Column({
    name: 'aliq_icms_value',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  aliqIcmsValue!: number;

  @Column({ name: 'icms_value', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  icmsValue!: number;

  @Column({ name: 'sku_id', type: 'integer', nullable: true })
  skuId!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Invoice, (inv) => inv.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: Invoice;
}
