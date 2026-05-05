import { MigrationInterface, QueryRunner } from 'typeorm';

export class NfeIngestions1700000000002 implements MigrationInterface {
  name = 'NfeIngestions1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nfe_ingestions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        idempotency_key VARCHAR(64) NOT NULL UNIQUE,
        source VARCHAR(32) NOT NULL,
        external_ref VARCHAR(512),
        access_key VARCHAR(44),
        raw_storage_key VARCHAR(1024) NOT NULL,
        checksum_sha256 VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'accepted',
        error_code VARCHAR(64),
        correlation_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_nfe_ingestions_idempotency ON nfe_ingestions(idempotency_key)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nfe_ingestions_access_key ON nfe_ingestions(access_key)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nfe_ingestions_created_at ON nfe_ingestions(created_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outbox_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        exchange VARCHAR(128) NOT NULL,
        routing_key VARCHAR(256) NOT NULL,
        payload JSONB NOT NULL,
        headers JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        published_at TIMESTAMPTZ,
        attempt_count INT NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_outbox_messages_status ON outbox_messages(status) WHERE status = 'pending'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nfe_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        idempotency_key VARCHAR(128) NOT NULL UNIQUE,
        access_key VARCHAR(44),
        event_type VARCHAR(64) NOT NULL,
        sequence INT,
        payload_storage_key VARCHAR(1024) NOT NULL,
        checksum_sha256 VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        error_code VARCHAR(64),
        error_message TEXT,
        correlation_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_nfe_events_idempotency ON nfe_events(idempotency_key)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nfe_events_access_key ON nfe_events(access_key)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS nfe_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS nfe_ingestions`);
  }
}
