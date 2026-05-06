import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('nfe_events')
export class NfeEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'access_key', type: 'varchar', length: 44, nullable: true })
  accessKey!: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ type: 'int', nullable: true })
  sequence!: number | null;

  @Column({ name: 'payload_storage_key', type: 'varchar', length: 1024 })
  payloadStorageKey!: string;

  @Column({ name: 'checksum_sha256', type: 'varchar', length: 64 })
  checksumSha256!: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: string;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64, nullable: true })
  correlationId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
