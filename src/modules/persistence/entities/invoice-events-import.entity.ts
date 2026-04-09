import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InvoiceImportStatus } from '../../../common/enums/invoice-import-status.enum';

@Entity('invoice_events_imports')
export class InvoiceEventsImport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cursor!: string | null;

  @Column({ name: 'next_cursor', type: 'varchar', length: 255, nullable: true })
  nextCursor!: string | null;

  @Column({ type: 'smallint', default: InvoiceImportStatus.PENDING })
  status!: InvoiceImportStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
