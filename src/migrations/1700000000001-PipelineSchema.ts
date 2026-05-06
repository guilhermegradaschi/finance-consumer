import { MigrationInterface, QueryRunner } from 'typeorm';

export class PipelineSchema1700000000001 implements MigrationInterface {
  name = 'PipelineSchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_imports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        filter_start TIMESTAMPTZ NOT NULL,
        filter_end TIMESTAMPTZ NOT NULL,
        source SMALLINT NOT NULL DEFAULT 0,
        status SMALLINT NOT NULL DEFAULT 0,
        automatic BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_import_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_import_id UUID NOT NULL REFERENCES invoice_imports(id) ON DELETE CASCADE,
        status SMALLINT NOT NULL DEFAULT 0,
        log JSONB NOT NULL DEFAULT '{}',
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_invoice_import_logs_import_id ON invoice_import_logs(invoice_import_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS external_invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        access_key VARCHAR(44) NOT NULL UNIQUE,
        invoice_number VARCHAR(20) NOT NULL,
        date TIMESTAMPTZ NOT NULL,
        value DECIMAL(15,2) NOT NULL DEFAULT 0,
        delivery_date TIMESTAMPTZ,
        order_number VARCHAR(100),
        buyer_cnpj VARCHAR(14) NOT NULL,
        seller_cnpj VARCHAR(14) NOT NULL,
        buyer_name VARCHAR(255),
        code_operation VARCHAR(10),
        operation VARCHAR(50) NOT NULL DEFAULT 'Venda',
        source SMALLINT NOT NULL DEFAULT 0,
        status SMALLINT NOT NULL DEFAULT 0,
        filename VARCHAR(512),
        error_message TEXT,
        invoice_import_id UUID REFERENCES invoice_imports(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_external_invoices_status ON external_invoices(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_external_invoices_date ON external_invoices(date)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_external_invoices_operation ON external_invoices(operation)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_external_invoices_buyer_cnpj ON external_invoices(buyer_cnpj)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_external_invoices_seller_cnpj ON external_invoices(seller_cnpj)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_external_invoices_import_id ON external_invoices(invoice_import_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_number VARCHAR(20) NOT NULL,
        date DATE NOT NULL,
        value DECIMAL(15,2) NOT NULL DEFAULT 0,
        access_key VARCHAR(44) NOT NULL UNIQUE,
        buyer_id INTEGER,
        seller_id INTEGER,
        reference_date DATE,
        uf_recipient CHAR(2),
        uf_sender CHAR(2),
        observations TEXT,
        status SMALLINT NOT NULL DEFAULT 1,
        source SMALLINT NOT NULL DEFAULT 1,
        ignored_reason SMALLINT NOT NULL DEFAULT 0,
        operation VARCHAR(50) NOT NULL DEFAULT 'venda',
        code_operation VARCHAR(10),
        icmsdeson_discount_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        mp_net_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        mp_gross_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        delivery_date TIMESTAMPTZ,
        order_number VARCHAR(100),
        buyer_association VARCHAR(50),
        buyer_cnpj VARCHAR(14),
        seller_cnpj VARCHAR(14),
        external_invoice_id UUID REFERENCES external_invoices(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_buyer_seller ON invoices(buyer_id, seller_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_reference_date ON invoices(reference_date)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_invoices_external_invoice_id ON invoices(external_invoice_id)`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_buyer_cnpj ON invoices(buyer_cnpj)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_seller_cnpj ON invoices(seller_cnpj)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_name VARCHAR(500),
        ean VARCHAR(14),
        product_code VARCHAR(60),
        unit_measure VARCHAR(6),
        net_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        gross_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        qtde_item DECIMAL(15,4) NOT NULL DEFAULT 0,
        unit_value DECIMAL(21,10) NOT NULL DEFAULT 0,
        desc_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        ipi_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        icmsst_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        icmsdeson_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        fcpst_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        bc_icms_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        aliq_icms_value DECIMAL(5,2) NOT NULL DEFAULT 0,
        icms_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        sku_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoice_items_sku_id ON invoice_items(sku_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoice_items_ean ON invoice_items(ean)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        access_key VARCHAR(44) NOT NULL,
        event_type VARCHAR(10) NOT NULL,
        filename VARCHAR(512),
        status SMALLINT NOT NULL DEFAULT 0,
        error_message TEXT,
        invoice_id UUID REFERENCES invoices(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT idx_invoice_events_access_key_type UNIQUE (access_key, event_type)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoice_events_status ON invoice_events(status)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_events_imports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        cursor VARCHAR(255),
        next_cursor VARCHAR(255),
        status SMALLINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_external_invoices_updated_at ON external_invoices;
      CREATE TRIGGER update_external_invoices_updated_at
      BEFORE UPDATE ON external_invoices
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
      CREATE TRIGGER update_invoices_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_invoice_events_updated_at ON invoice_events;
      CREATE TRIGGER update_invoice_events_updated_at
      BEFORE UPDATE ON invoice_events
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_invoice_imports_updated_at ON invoice_imports;
      CREATE TRIGGER update_invoice_imports_updated_at
      BEFORE UPDATE ON invoice_imports
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_invoice_events_imports_updated_at ON invoice_events_imports;
      CREATE TRIGGER update_invoice_events_imports_updated_at
      BEFORE UPDATE ON invoice_events_imports
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS update_invoice_events_imports_updated_at ON invoice_events_imports`,
    );
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_invoice_imports_updated_at ON invoice_imports`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_invoice_events_updated_at ON invoice_events`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_external_invoices_updated_at ON external_invoices`);
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_events_imports`);
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS invoices`);
    await queryRunner.query(`DROP TABLE IF EXISTS external_invoices`);
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_import_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_imports`);
  }
}
