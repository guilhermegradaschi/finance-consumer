import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE nf_status AS ENUM (
          'RECEIVED','XML_VALIDATED','XML_ERROR','BUSINESS_VALIDATED',
          'BUSINESS_ERROR','PERSISTED','PERSISTENCE_ERROR','COMPLETED','FAILED'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN CREATE TYPE nf_source AS ENUM ('API','EMAIL','S3');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN CREATE TYPE nf_modelo AS ENUM ('55','65');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nota_fiscal (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chave_acesso VARCHAR(44) NOT NULL UNIQUE,
        numero INTEGER NOT NULL,
        serie SMALLINT NOT NULL DEFAULT 1,
        modelo nf_modelo NOT NULL DEFAULT '55',
        data_emissao TIMESTAMPTZ NOT NULL,
        data_entrada_saida TIMESTAMPTZ,
        natureza_operacao VARCHAR(255) NOT NULL,
        tipo_operacao SMALLINT NOT NULL,
        valor_total_produtos DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_total_nf DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_desconto DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_frete DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_seguro DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_icms DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_ipi DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_pis DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_cofins DECIMAL(15,2) NOT NULL DEFAULT 0,
        informacoes_complementares TEXT,
        status nf_status NOT NULL DEFAULT 'RECEIVED',
        source nf_source NOT NULL,
        xml_s3_key VARCHAR(512),
        idempotency_key VARCHAR(64) NOT NULL UNIQUE,
        protocolo_autorizacao VARCHAR(20),
        data_autorizacao TIMESTAMPTZ,
        error_message TEXT,
        retry_count SMALLINT NOT NULL DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nota_fiscal_status ON nota_fiscal(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nota_fiscal_data_emissao ON nota_fiscal(data_emissao)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nota_fiscal_source ON nota_fiscal(source)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nota_fiscal_created_at ON nota_fiscal(created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nota_fiscal_numero_serie ON nota_fiscal(numero, serie)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nota_fiscal_metadata ON nota_fiscal USING GIN(metadata)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nf_item (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        numero_item SMALLINT NOT NULL,
        codigo_produto VARCHAR(60) NOT NULL,
        ean VARCHAR(14),
        descricao VARCHAR(500) NOT NULL,
        ncm VARCHAR(8) NOT NULL,
        cest VARCHAR(7),
        cfop VARCHAR(4) NOT NULL,
        unidade_comercial VARCHAR(6) NOT NULL,
        quantidade DECIMAL(15,4) NOT NULL,
        valor_unitario DECIMAL(21,10) NOT NULL,
        valor_total DECIMAL(15,2) NOT NULL,
        valor_desconto DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_icms DECIMAL(15,2) NOT NULL DEFAULT 0,
        aliquota_icms DECIMAL(5,2) NOT NULL DEFAULT 0,
        valor_ipi DECIMAL(15,2) NOT NULL DEFAULT 0,
        aliquota_ipi DECIMAL(5,2) NOT NULL DEFAULT 0,
        valor_pis DECIMAL(15,2) NOT NULL DEFAULT 0,
        valor_cofins DECIMAL(15,2) NOT NULL DEFAULT 0,
        cst_icms VARCHAR(3),
        cst_ipi VARCHAR(2),
        cst_pis VARCHAR(2),
        cst_cofins VARCHAR(2),
        informacoes_adicionais TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT idx_nf_item_unique UNIQUE (nota_fiscal_id, numero_item)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nf_item_nota_fiscal_id ON nf_item(nota_fiscal_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nf_item_ncm ON nf_item(ncm)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nf_item_cfop ON nf_item(cfop)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nf_emitente (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        cnpj VARCHAR(14) NOT NULL, cpf VARCHAR(11),
        razao_social VARCHAR(255) NOT NULL, nome_fantasia VARCHAR(255),
        inscricao_estadual VARCHAR(20), inscricao_municipal VARCHAR(20),
        cnae VARCHAR(7), crt SMALLINT,
        logradouro VARCHAR(255), numero VARCHAR(60), complemento VARCHAR(255),
        bairro VARCHAR(100), codigo_municipio VARCHAR(7), nome_municipio VARCHAR(100),
        uf CHAR(2), cep VARCHAR(8), telefone VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nf_emitente_cnpj ON nf_emitente(cnpj)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nf_destinatario (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        cnpj VARCHAR(14), cpf VARCHAR(11),
        razao_social VARCHAR(255) NOT NULL, inscricao_estadual VARCHAR(20),
        email VARCHAR(255), logradouro VARCHAR(255), numero VARCHAR(60),
        complemento VARCHAR(255), bairro VARCHAR(100),
        codigo_municipio VARCHAR(7), nome_municipio VARCHAR(100),
        uf CHAR(2), cep VARCHAR(8), telefone VARCHAR(20),
        indicador_ie SMALLINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nf_destinatario_cnpj ON nf_destinatario(cnpj)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nf_destinatario_cpf ON nf_destinatario(cpf)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nf_transporte (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        modalidade_frete SMALLINT NOT NULL,
        cnpj_transportadora VARCHAR(14), razao_social VARCHAR(255),
        inscricao_estadual VARCHAR(20), endereco VARCHAR(255),
        municipio VARCHAR(100), uf CHAR(2),
        placa_veiculo VARCHAR(7), uf_veiculo CHAR(2),
        quantidade_volumes INTEGER, especie_volumes VARCHAR(60),
        peso_liquido DECIMAL(15,3), peso_bruto DECIMAL(15,3),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nf_pagamento (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        forma_pagamento VARCHAR(2) NOT NULL,
        valor DECIMAL(15,2) NOT NULL,
        tipo_integracao SMALLINT,
        cnpj_credenciadora VARCHAR(14), bandeira_cartao VARCHAR(2),
        autorizacao VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_nf_pagamento_nota_fiscal_id ON nf_pagamento(nota_fiscal_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS nf_processing_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID REFERENCES nota_fiscal(id) ON DELETE SET NULL,
        chave_acesso VARCHAR(44) NOT NULL,
        stage VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        source nf_source,
        error_code VARCHAR(50), error_message TEXT,
        duration_ms INTEGER, attempt_number SMALLINT NOT NULL DEFAULT 1,
        trace_id VARCHAR(64), metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_nf_processing_log_chave_acesso ON nf_processing_log(chave_acesso)`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_nf_processing_log_stage ON nf_processing_log(stage)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_nf_processing_log_created_at ON nf_processing_log(created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ language 'plpgsql'
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_nota_fiscal_updated_at ON nota_fiscal;
      CREATE TRIGGER update_nota_fiscal_updated_at
      BEFORE UPDATE ON nota_fiscal
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_nota_fiscal_updated_at ON nota_fiscal`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column`);
    await queryRunner.query(`DROP TABLE IF EXISTS nf_processing_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS nf_pagamento`);
    await queryRunner.query(`DROP TABLE IF EXISTS nf_transporte`);
    await queryRunner.query(`DROP TABLE IF EXISTS nf_destinatario`);
    await queryRunner.query(`DROP TABLE IF EXISTS nf_emitente`);
    await queryRunner.query(`DROP TABLE IF EXISTS nf_item`);
    await queryRunner.query(`DROP TABLE IF EXISTS nota_fiscal`);
    await queryRunner.query(`DROP TYPE IF EXISTS nf_modelo`);
    await queryRunner.query(`DROP TYPE IF EXISTS nf_source`);
    await queryRunner.query(`DROP TYPE IF EXISTS nf_status`);
  }
}
