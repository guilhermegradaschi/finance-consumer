import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { InvoiceEventStatus } from '../../../common/enums/invoice-event-status.enum';
import { Invoice } from './invoice.entity';

@Entity('invoice_events')
@Index('idx_invoice_events_access_key_type', ['accessKey', 'eventType'], { unique: true })
@Index('idx_invoice_events_status', ['status'])
export class InvoiceEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'access_key', type: 'varchar', length: 44 })
  accessKey!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 10 })
  eventType!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  filename!: string | null;

  @Column({ type: 'smallint', default: InvoiceEventStatus.PENDING })
  status!: InvoiceEventStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Invoice, { nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: Invoice | null;
}
