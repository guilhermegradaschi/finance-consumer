import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { NfeIngestionStatus } from '../../../common/enums/nfe-ingestion-status.enum';

@Entity('nfe_ingestions')
export class NfeIngestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, unique: true })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 32 })
  source!: string;

  @Column({ name: 'external_ref', type: 'varchar', length: 512, nullable: true })
  externalRef!: string | null;

  @Column({ name: 'access_key', type: 'varchar', length: 44, nullable: true })
  accessKey!: string | null;

  @Column({ name: 'raw_storage_key', type: 'varchar', length: 1024 })
  rawStorageKey!: string;

  @Column({ name: 'checksum_sha256', type: 'varchar', length: 64 })
  checksumSha256!: string;

  @Column({ type: 'varchar', length: 32, default: NfeIngestionStatus.ACCEPTED })
  status!: NfeIngestionStatus;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64, nullable: true })
  correlationId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
