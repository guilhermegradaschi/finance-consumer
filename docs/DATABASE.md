# DATABASE.md — Schema, Entities, Migrations e Repositories

## 1. Diagrama Entidade-Relacionamento (textual)

```
┌──────────────────┐       ┌──────────────────┐
│   nota_fiscal    │1─────N│     nf_item      │
│                  │       │                  │
│ id (PK, UUID)    │       │ id (PK, UUID)    │
│ chave_acesso (UQ)│       │ nota_fiscal_id   │
│ numero           │       │ numero_item      │
│ serie            │       │ codigo_produto   │
│ ...              │       │ descricao        │
└──────┬───────────┘       │ ncm              │
       │                   │ cfop             │
       │1                  │ quantidade       │
       │                   │ valor_unitario   │
       ├──────N┐           │ valor_total      │
       │       │           └──────────────────┘
       │       │
┌──────┴───────┐  ┌──────────────────┐
│ nf_emitente  │  │nf_destinatario   │
│              │  │                  │
│ id (PK, UUID)│  │ id (PK, UUID)    │
│nota_fiscal_id│  │ nota_fiscal_id   │
│ cnpj         │  │ cnpj_cpf         │
│ razao_social │  │ razao_social     │
│ ...          │  │ ...              │
└──────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐
│  nf_transporte   │  │  nf_pagamento    │
│                  │  │                  │
│ id (PK, UUID)    │  │ id (PK, UUID)    │
│ nota_fiscal_id   │  │ nota_fiscal_id   │
│ modalidade_frete │  │ forma_pagamento  │
│ ...              │  │ valor            │
└──────────────────┘  └──────────────────┘

┌──────────────────┐
│nf_processing_log │
│                  │
│ id (PK, UUID)    │
│ nota_fiscal_id   │
│ stage            │
│ status           │
│ error_message    │
│ ...              │
└──────────────────┘
```

---

## 2. Schema PostgreSQL Completo

### 2.1 Tabela `nota_fiscal`

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para buscas full-text

CREATE TYPE nf_status AS ENUM (
    'RECEIVED',
    'XML_VALIDATED',
    'XML_ERROR',
    'BUSINESS_VALIDATED',
    'BUSINESS_ERROR',
    'PERSISTED',
    'PERSISTENCE_ERROR',
    'COMPLETED',
    'FAILED'
);

CREATE TYPE nf_source AS ENUM ('API', 'EMAIL', 'S3');

CREATE TYPE nf_modelo AS ENUM ('55', '65'); -- 55=NF-e, 65=NFC-e

CREATE TABLE nota_fiscal (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chave_acesso        VARCHAR(44) NOT NULL UNIQUE,
    numero              INTEGER NOT NULL,
    serie               SMALLINT NOT NULL DEFAULT 1,
    modelo              nf_modelo NOT NULL DEFAULT '55',
    data_emissao        TIMESTAMP WITH TIME ZONE NOT NULL,
    data_entrada_saida  TIMESTAMP WITH TIME ZONE,
    natureza_operacao   VARCHAR(255) NOT NULL,
    tipo_operacao       SMALLINT NOT NULL, -- 0=Entrada, 1=Saída
    valor_total_produtos DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_total_nf      DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_desconto      DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_frete         DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_seguro        DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_icms          DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_ipi           DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_pis           DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_cofins        DECIMAL(15,2) NOT NULL DEFAULT 0,
    informacoes_complementares TEXT,
    status              nf_status NOT NULL DEFAULT 'RECEIVED',
    source              nf_source NOT NULL,
    xml_s3_key          VARCHAR(512),
    idempotency_key     VARCHAR(64) NOT NULL UNIQUE,
    protocolo_autorizacao VARCHAR(20),
    data_autorizacao    TIMESTAMP WITH TIME ZONE,
    error_message       TEXT,
    retry_count         SMALLINT NOT NULL DEFAULT 0,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMP WITH TIME ZONE
);

-- Índices
CREATE INDEX idx_nota_fiscal_chave_acesso ON nota_fiscal (chave_acesso);
CREATE INDEX idx_nota_fiscal_status ON nota_fiscal (status);
CREATE INDEX idx_nota_fiscal_data_emissao ON nota_fiscal (data_emissao);
CREATE INDEX idx_nota_fiscal_source ON nota_fiscal (source);
CREATE INDEX idx_nota_fiscal_created_at ON nota_fiscal (created_at DESC);
CREATE INDEX idx_nota_fiscal_numero_serie ON nota_fiscal (numero, serie);
CREATE INDEX idx_nota_fiscal_idempotency_key ON nota_fiscal (idempotency_key);
CREATE INDEX idx_nota_fiscal_metadata ON nota_fiscal USING GIN (metadata);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_nota_fiscal_updated_at
    BEFORE UPDATE ON nota_fiscal
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 Tabela `nf_item`

```sql
CREATE TABLE nf_item (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nota_fiscal_id      UUID NOT NULL REFERENCES nota_fiscal(id) ON DELETE CASCADE,
    numero_item         SMALLINT NOT NULL,
    codigo_produto      VARCHAR(60) NOT NULL,
    ean                 VARCHAR(14),
    descricao           VARCHAR(500) NOT NULL,
    ncm                 VARCHAR(8) NOT NULL,
    cest                VARCHAR(7),
    cfop                VARCHAR(4) NOT NULL,
    unidade_comercial   VARCHAR(6) NOT NULL,
    quantidade          DECIMAL(15,4) NOT NULL,
    valor_unitario      DECIMAL(21,10) NOT NULL,
    valor_total         DECIMAL(15,2) NOT NULL,
    valor_desconto      DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_icms          DECIMAL(15,2) NOT NULL DEFAULT 0,
    aliquota_icms       DECIMAL(5,2) NOT NULL DEFAULT 0,
    valor_ipi           DECIMAL(15,2) NOT NULL DEFAULT 0,
    aliquota_ipi        DECIMAL(5,2) NOT NULL DEFAULT 0,
    valor_pis           DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_cofins        DECIMAL(15,2) NOT NULL DEFAULT 0,
    cst_icms            VARCHAR(3),
    cst_ipi             VARCHAR(2),
    cst_pis             VARCHAR(2),
    cst_cofins          VARCHAR(2),
    informacoes_adicionais TEXT,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nf_item_nota_fiscal_id ON nf_item (nota_fiscal_id);
CREATE INDEX idx_nf_item_codigo_produto ON nf_item (codigo_produto);
CREATE INDEX idx_nf_item_ncm ON nf_item (ncm);
CREATE INDEX idx_nf_item_cfop ON nf_item (cfop);
CREATE UNIQUE INDEX idx_nf_item_unique ON nf_item (nota_fiscal_id, numero_item);
```

### 2.3 Tabela `nf_emitente`

```sql
CREATE TABLE nf_emitente (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nota_fiscal_id      UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
    cnpj                VARCHAR(14) NOT NULL,
    cpf                 VARCHAR(11),
    razao_social        VARCHAR(255) NOT NULL,
    nome_fantasia       VARCHAR(255),
    inscricao_estadual  VARCHAR(20),
    inscricao_municipal VARCHAR(20),
    cnae                VARCHAR(7),
    crt                 SMALLINT, -- 1=Simples Nacional, 2=Simples Excesso, 3=Normal
    logradouro          VARCHAR(255),
    numero              VARCHAR(60),
    complemento         VARCHAR(255),
    bairro              VARCHAR(100),
    codigo_municipio    VARCHAR(7),
    nome_municipio      VARCHAR(100),
    uf                  CHAR(2),
    cep                 VARCHAR(8),
    telefone            VARCHAR(20),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nf_emitente_cnpj ON nf_emitente (cnpj);
CREATE INDEX idx_nf_emitente_uf ON nf_emitente (uf);
CREATE INDEX idx_nf_emitente_nota_fiscal_id ON nf_emitente (nota_fiscal_id);
```

### 2.4 Tabela `nf_destinatario`

```sql
CREATE TABLE nf_destinatario (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nota_fiscal_id      UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
    cnpj                VARCHAR(14),
    cpf                 VARCHAR(11),
    razao_social        VARCHAR(255) NOT NULL,
    inscricao_estadual  VARCHAR(20),
    email               VARCHAR(255),
    logradouro          VARCHAR(255),
    numero              VARCHAR(60),
    complemento         VARCHAR(255),
    bairro              VARCHAR(100),
    codigo_municipio    VARCHAR(7),
    nome_municipio      VARCHAR(100),
    uf                  CHAR(2),
    cep                 VARCHAR(8),
    telefone            VARCHAR(20),
    indicador_ie        SMALLINT, -- 1=Contribuinte, 2=Isento, 9=Não contribuinte
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nf_destinatario_cnpj ON nf_destinatario (cnpj);
CREATE INDEX idx_nf_destinatario_cpf ON nf_destinatario (cpf);
CREATE INDEX idx_nf_destinatario_nota_fiscal_id ON nf_destinatario (nota_fiscal_id);
```

### 2.5 Tabela `nf_transporte`

```sql
CREATE TABLE nf_transporte (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nota_fiscal_id      UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
    modalidade_frete    SMALLINT NOT NULL, -- 0=Emitente, 1=Destinatário, 2=Terceiros, 9=Sem frete
    cnpj_transportadora VARCHAR(14),
    razao_social        VARCHAR(255),
    inscricao_estadual  VARCHAR(20),
    endereco            VARCHAR(255),
    municipio           VARCHAR(100),
    uf                  CHAR(2),
    placa_veiculo       VARCHAR(7),
    uf_veiculo          CHAR(2),
    quantidade_volumes  INTEGER,
    especie_volumes     VARCHAR(60),
    peso_liquido        DECIMAL(15,3),
    peso_bruto          DECIMAL(15,3),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nf_transporte_nota_fiscal_id ON nf_transporte (nota_fiscal_id);
```

### 2.6 Tabela `nf_pagamento`

```sql
CREATE TABLE nf_pagamento (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nota_fiscal_id      UUID NOT NULL REFERENCES nota_fiscal(id) ON DELETE CASCADE,
    forma_pagamento     VARCHAR(2) NOT NULL, -- 01=Dinheiro, 02=Cheque, 03=Cartão Crédito, etc
    valor               DECIMAL(15,2) NOT NULL,
    tipo_integracao     SMALLINT, -- 1=Integrado, 2=Não integrado
    cnpj_credenciadora  VARCHAR(14),
    bandeira_cartao     VARCHAR(2),
    autorizacao         VARCHAR(20),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nf_pagamento_nota_fiscal_id ON nf_pagamento (nota_fiscal_id);
```

### 2.7 Tabela `nf_processing_log`

```sql
CREATE TABLE nf_processing_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nota_fiscal_id      UUID REFERENCES nota_fiscal(id) ON DELETE SET NULL,
    chave_acesso        VARCHAR(44) NOT NULL,
    stage               VARCHAR(50) NOT NULL, -- RECEIVE, XML_PROCESS, BUSINESS_VALIDATE, PERSIST
    status              VARCHAR(20) NOT NULL,  -- SUCCESS, ERROR, RETRY, DLQ
    source              nf_source,
    error_code          VARCHAR(50),
    error_message       TEXT,
    duration_ms         INTEGER,
    attempt_number      SMALLINT NOT NULL DEFAULT 1,
    trace_id            VARCHAR(64),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nf_processing_log_nota_fiscal_id ON nf_processing_log (nota_fiscal_id);
CREATE INDEX idx_nf_processing_log_chave_acesso ON nf_processing_log (chave_acesso);
CREATE INDEX idx_nf_processing_log_stage ON nf_processing_log (stage);
CREATE INDEX idx_nf_processing_log_status ON nf_processing_log (status);
CREATE INDEX idx_nf_processing_log_created_at ON nf_processing_log (created_at DESC);
CREATE INDEX idx_nf_processing_log_trace_id ON nf_processing_log (trace_id);
```

---

## 3. TypeORM Entities

### 3.1 `nota-fiscal.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  Index,
} from 'typeorm';
import { NfItem } from './nf-item.entity';
import { NfEmitente } from './nf-emitente.entity';
import { NfDestinatario } from './nf-destinatario.entity';
import { NfTransporte } from './nf-transporte.entity';
import { NfPagamento } from './nf-pagamento.entity';
import { NfProcessingLog } from './nf-processing-log.entity';
import { NfStatus } from '../../common/enums/nf-status.enum';
import { NfSource } from '../../common/enums/nf-source.enum';

@Entity('nota_fiscal')
@Index('idx_nota_fiscal_chave_acesso', ['chaveAcesso'])
@Index('idx_nota_fiscal_status', ['status'])
@Index('idx_nota_fiscal_data_emissao', ['dataEmissao'])
@Index('idx_nota_fiscal_numero_serie', ['numero', 'serie'])
export class NotaFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chave_acesso', type: 'varchar', length: 44, unique: true })
  chaveAcesso: string;

  @Column({ type: 'integer' })
  numero: number;

  @Column({ type: 'smallint', default: 1 })
  serie: number;

  @Column({ type: 'enum', enum: ['55', '65'], default: '55' })
  modelo: string;

  @Column({ name: 'data_emissao', type: 'timestamptz' })
  dataEmissao: Date;

  @Column({ name: 'data_entrada_saida', type: 'timestamptz', nullable: true })
  dataEntradaSaida: Date | null;

  @Column({ name: 'natureza_operacao', type: 'varchar', length: 255 })
  naturezaOperacao: string;

  @Column({ name: 'tipo_operacao', type: 'smallint' })
  tipoOperacao: number;

  @Column({
    name: 'valor_total_produtos',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorTotalProdutos: number;

  @Column({
    name: 'valor_total_nf',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorTotalNf: number;

  @Column({
    name: 'valor_desconto',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorDesconto: number;

  @Column({
    name: 'valor_frete',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorFrete: number;

  @Column({
    name: 'valor_seguro',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorSeguro: number;

  @Column({
    name: 'valor_icms',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorIcms: number;

  @Column({
    name: 'valor_ipi',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorIpi: number;

  @Column({
    name: 'valor_pis',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorPis: number;

  @Column({
    name: 'valor_cofins',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  valorCofins: number;

  @Column({ name: 'informacoes_complementares', type: 'text', nullable: true })
  informacoesComplementares: string | null;

  @Column({ type: 'enum', enum: NfStatus, default: NfStatus.RECEIVED })
  status: NfStatus;

  @Column({ type: 'enum', enum: NfSource })
  source: NfSource;

  @Column({ name: 'xml_s3_key', type: 'varchar', length: 512, nullable: true })
  xmlS3Key: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, unique: true })
  idempotencyKey: string;

  @Column({ name: 'protocolo_autorizacao', type: 'varchar', length: 20, nullable: true })
  protocoloAutorizacao: string | null;

  @Column({ name: 'data_autorizacao', type: 'timestamptz', nullable: true })
  dataAutorizacao: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  // Relacionamentos
  @OneToMany(() => NfItem, (item) => item.notaFiscal, { cascade: true })
  itens: NfItem[];

  @OneToOne(() => NfEmitente, (emitente) => emitente.notaFiscal, { cascade: true })
  emitente: NfEmitente;

  @OneToOne(() => NfDestinatario, (destinatario) => destinatario.notaFiscal, { cascade: true })
  destinatario: NfDestinatario;

  @OneToOne(() => NfTransporte, (transporte) => transporte.notaFiscal, { cascade: true })
  transporte: NfTransporte;

  @OneToMany(() => NfPagamento, (pagamento) => pagamento.notaFiscal, { cascade: true })
  pagamentos: NfPagamento[];

  @OneToMany(() => NfProcessingLog, (log) => log.notaFiscal)
  processingLogs: NfProcessingLog[];
}
```

### 3.2 `nf-item.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

@Entity('nf_item')
@Unique('idx_nf_item_unique', ['notaFiscalId', 'numeroItem'])
export class NfItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid' })
  notaFiscalId: string;

  @Column({ name: 'numero_item', type: 'smallint' })
  numeroItem: number;

  @Column({ name: 'codigo_produto', type: 'varchar', length: 60 })
  codigoProduto: string;

  @Column({ type: 'varchar', length: 14, nullable: true })
  ean: string | null;

  @Column({ type: 'varchar', length: 500 })
  descricao: string;

  @Column({ type: 'varchar', length: 8 })
  ncm: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cest: string | null;

  @Column({ type: 'varchar', length: 4 })
  cfop: string;

  @Column({ name: 'unidade_comercial', type: 'varchar', length: 6 })
  unidadeComercial: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  quantidade: number;

  @Column({
    name: 'valor_unitario',
    type: 'decimal',
    precision: 21,
    scale: 10,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valorUnitario: number;

  @Column({
    name: 'valor_total',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valorTotal: number;

  @Column({
    name: 'valor_desconto',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valorDesconto: number;

  @Column({
    name: 'valor_icms',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valorIcms: number;

  @Column({
    name: 'aliquota_icms',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  aliquotaIcms: number;

  @Column({
    name: 'valor_ipi',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valorIpi: number;

  @Column({
    name: 'aliquota_ipi',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  aliquotaIpi: number;

  @Column({
    name: 'valor_pis',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valorPis: number;

  @Column({
    name: 'valor_cofins',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valorCofins: number;

  @Column({ name: 'cst_icms', type: 'varchar', length: 3, nullable: true })
  cstIcms: string | null;

  @Column({ name: 'cst_ipi', type: 'varchar', length: 2, nullable: true })
  cstIpi: string | null;

  @Column({ name: 'cst_pis', type: 'varchar', length: 2, nullable: true })
  cstPis: string | null;

  @Column({ name: 'cst_cofins', type: 'varchar', length: 2, nullable: true })
  cstCofins: string | null;

  @Column({ name: 'informacoes_adicionais', type: 'text', nullable: true })
  informacoesAdicionais: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => NotaFiscal, (nf) => nf.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal: NotaFiscal;
}
```

### 3.3 `nf-emitente.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

@Entity('nf_emitente')
export class NfEmitente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid', unique: true })
  notaFiscalId: string;

  @Column({ type: 'varchar', length: 14 })
  cnpj: string;

  @Column({ type: 'varchar', length: 11, nullable: true })
  cpf: string | null;

  @Column({ name: 'razao_social', type: 'varchar', length: 255 })
  razaoSocial: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 255, nullable: true })
  nomeFantasia: string | null;

  @Column({ name: 'inscricao_estadual', type: 'varchar', length: 20, nullable: true })
  inscricaoEstadual: string | null;

  @Column({ name: 'inscricao_municipal', type: 'varchar', length: 20, nullable: true })
  inscricaoMunicipal: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  cnae: string | null;

  @Column({ type: 'smallint', nullable: true })
  crt: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logradouro: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  numero: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  complemento: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bairro: string | null;

  @Column({ name: 'codigo_municipio', type: 'varchar', length: 7, nullable: true })
  codigoMunicipio: string | null;

  @Column({ name: 'nome_municipio', type: 'varchar', length: 100, nullable: true })
  nomeMunicipio: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  uf: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  cep: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToOne(() => NotaFiscal, (nf) => nf.emitente, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal: NotaFiscal;
}
```

### 3.4 `nf-destinatario.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

@Entity('nf_destinatario')
export class NfDestinatario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid', unique: true })
  notaFiscalId: string;

  @Column({ type: 'varchar', length: 14, nullable: true })
  cnpj: string | null;

  @Column({ type: 'varchar', length: 11, nullable: true })
  cpf: string | null;

  @Column({ name: 'razao_social', type: 'varchar', length: 255 })
  razaoSocial: string;

  @Column({ name: 'inscricao_estadual', type: 'varchar', length: 20, nullable: true })
  inscricaoEstadual: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logradouro: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  numero: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  complemento: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bairro: string | null;

  @Column({ name: 'codigo_municipio', type: 'varchar', length: 7, nullable: true })
  codigoMunicipio: string | null;

  @Column({ name: 'nome_municipio', type: 'varchar', length: 100, nullable: true })
  nomeMunicipio: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  uf: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  cep: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  @Column({ name: 'indicador_ie', type: 'smallint', nullable: true })
  indicadorIe: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToOne(() => NotaFiscal, (nf) => nf.destinatario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal: NotaFiscal;
}
```

### 3.5 `nf-transporte.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

@Entity('nf_transporte')
export class NfTransporte {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid', unique: true })
  notaFiscalId: string;

  @Column({ name: 'modalidade_frete', type: 'smallint' })
  modalidadeFrete: number;

  @Column({ name: 'cnpj_transportadora', type: 'varchar', length: 14, nullable: true })
  cnpjTransportadora: string | null;

  @Column({ name: 'razao_social', type: 'varchar', length: 255, nullable: true })
  razaoSocial: string | null;

  @Column({ name: 'inscricao_estadual', type: 'varchar', length: 20, nullable: true })
  inscricaoEstadual: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  endereco: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  municipio: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  uf: string | null;

  @Column({ name: 'placa_veiculo', type: 'varchar', length: 7, nullable: true })
  placaVeiculo: string | null;

  @Column({ name: 'uf_veiculo', type: 'char', length: 2, nullable: true })
  ufVeiculo: string | null;

  @Column({ name: 'quantidade_volumes', type: 'integer', nullable: true })
  quantidadeVolumes: number | null;

  @Column({ name: 'especie_volumes', type: 'varchar', length: 60, nullable: true })
  especieVolumes: string | null;

  @Column({
    name: 'peso_liquido',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
    transformer: { to: (v: number) => v, from: (v: string) => (v ? parseFloat(v) : null) },
  })
  pesoLiquido: number | null;

  @Column({
    name: 'peso_bruto',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
    transformer: { to: (v: number) => v, from: (v: string) => (v ? parseFloat(v) : null) },
  })
  pesoBruto: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToOne(() => NotaFiscal, (nf) => nf.transporte, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal: NotaFiscal;
}
```

### 3.6 `nf-pagamento.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';

@Entity('nf_pagamento')
export class NfPagamento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid' })
  notaFiscalId: string;

  @Column({ name: 'forma_pagamento', type: 'varchar', length: 2 })
  formaPagamento: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  valor: number;

  @Column({ name: 'tipo_integracao', type: 'smallint', nullable: true })
  tipoIntegracao: number | null;

  @Column({ name: 'cnpj_credenciadora', type: 'varchar', length: 14, nullable: true })
  cnpjCredenciadora: string | null;

  @Column({ name: 'bandeira_cartao', type: 'varchar', length: 2, nullable: true })
  bandeiraCartao: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  autorizacao: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => NotaFiscal, (nf) => nf.pagamentos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal: NotaFiscal;
}
```

### 3.7 `nf-processing-log.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { NotaFiscal } from './nota-fiscal.entity';
import { NfSource } from '../../common/enums/nf-source.enum';

@Entity('nf_processing_log')
export class NfProcessingLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nota_fiscal_id', type: 'uuid', nullable: true })
  notaFiscalId: string | null;

  @Column({ name: 'chave_acesso', type: 'varchar', length: 44 })
  chaveAcesso: string;

  @Column({ type: 'varchar', length: 50 })
  stage: string;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'enum', enum: NfSource, nullable: true })
  source: NfSource | null;

  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number | null;

  @Column({ name: 'attempt_number', type: 'smallint', default: 1 })
  attemptNumber: number;

  @Column({ name: 'trace_id', type: 'varchar', length: 64, nullable: true })
  traceId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => NotaFiscal, (nf) => nf.processingLogs, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'nota_fiscal_id' })
  notaFiscal: NotaFiscal | null;
}
```

---

## 4. Enums

### `nf-status.enum.ts`

```typescript
export enum NfStatus {
  RECEIVED = 'RECEIVED',
  XML_VALIDATED = 'XML_VALIDATED',
  XML_ERROR = 'XML_ERROR',
  BUSINESS_VALIDATED = 'BUSINESS_VALIDATED',
  BUSINESS_ERROR = 'BUSINESS_ERROR',
  PERSISTED = 'PERSISTED',
  PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
```

### `nf-source.enum.ts`

```typescript
export enum NfSource {
  API = 'API',
  EMAIL = 'EMAIL',
  S3 = 'S3',
}
```

---

## 5. Migrations TypeORM

### 5.1 Migration principal

```typescript
// migrations/1700000000000-InitialSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extensões
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    // Tipos ENUM
    await queryRunner.query(`
      CREATE TYPE nf_status AS ENUM (
        'RECEIVED','XML_VALIDATED','XML_ERROR','BUSINESS_VALIDATED',
        'BUSINESS_ERROR','PERSISTED','PERSISTENCE_ERROR','COMPLETED','FAILED'
      )
    `);
    await queryRunner.query(`CREATE TYPE nf_source AS ENUM ('API','EMAIL','S3')`);
    await queryRunner.query(`CREATE TYPE nf_modelo AS ENUM ('55','65')`);

    // Tabela nota_fiscal
    await queryRunner.query(`
      CREATE TABLE nota_fiscal (
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

    // Índices nota_fiscal
    await queryRunner.query(`CREATE INDEX idx_nota_fiscal_status ON nota_fiscal(status)`);
    await queryRunner.query(`CREATE INDEX idx_nota_fiscal_data_emissao ON nota_fiscal(data_emissao)`);
    await queryRunner.query(`CREATE INDEX idx_nota_fiscal_source ON nota_fiscal(source)`);
    await queryRunner.query(`CREATE INDEX idx_nota_fiscal_created_at ON nota_fiscal(created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_nota_fiscal_numero_serie ON nota_fiscal(numero, serie)`);
    await queryRunner.query(`CREATE INDEX idx_nota_fiscal_metadata ON nota_fiscal USING GIN(metadata)`);

    // Tabela nf_item
    await queryRunner.query(`
      CREATE TABLE nf_item (
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
    await queryRunner.query(`CREATE INDEX idx_nf_item_nota_fiscal_id ON nf_item(nota_fiscal_id)`);
    await queryRunner.query(`CREATE INDEX idx_nf_item_ncm ON nf_item(ncm)`);
    await queryRunner.query(`CREATE INDEX idx_nf_item_cfop ON nf_item(cfop)`);

    // Tabela nf_emitente
    await queryRunner.query(`
      CREATE TABLE nf_emitente (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        cnpj VARCHAR(14) NOT NULL,
        cpf VARCHAR(11),
        razao_social VARCHAR(255) NOT NULL,
        nome_fantasia VARCHAR(255),
        inscricao_estadual VARCHAR(20),
        inscricao_municipal VARCHAR(20),
        cnae VARCHAR(7),
        crt SMALLINT,
        logradouro VARCHAR(255),
        numero VARCHAR(60),
        complemento VARCHAR(255),
        bairro VARCHAR(100),
        codigo_municipio VARCHAR(7),
        nome_municipio VARCHAR(100),
        uf CHAR(2),
        cep VARCHAR(8),
        telefone VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_nf_emitente_cnpj ON nf_emitente(cnpj)`);

    // Tabela nf_destinatario
    await queryRunner.query(`
      CREATE TABLE nf_destinatario (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        cnpj VARCHAR(14),
        cpf VARCHAR(11),
        razao_social VARCHAR(255) NOT NULL,
        inscricao_estadual VARCHAR(20),
        email VARCHAR(255),
        logradouro VARCHAR(255),
        numero VARCHAR(60),
        complemento VARCHAR(255),
        bairro VARCHAR(100),
        codigo_municipio VARCHAR(7),
        nome_municipio VARCHAR(100),
        uf CHAR(2),
        cep VARCHAR(8),
        telefone VARCHAR(20),
        indicador_ie SMALLINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_nf_destinatario_cnpj ON nf_destinatario(cnpj)`);
    await queryRunner.query(`CREATE INDEX idx_nf_destinatario_cpf ON nf_destinatario(cpf)`);

    // Tabela nf_transporte
    await queryRunner.query(`
      CREATE TABLE nf_transporte (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL UNIQUE REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        modalidade_frete SMALLINT NOT NULL,
        cnpj_transportadora VARCHAR(14),
        razao_social VARCHAR(255),
        inscricao_estadual VARCHAR(20),
        endereco VARCHAR(255),
        municipio VARCHAR(100),
        uf CHAR(2),
        placa_veiculo VARCHAR(7),
        uf_veiculo CHAR(2),
        quantidade_volumes INTEGER,
        especie_volumes VARCHAR(60),
        peso_liquido DECIMAL(15,3),
        peso_bruto DECIMAL(15,3),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Tabela nf_pagamento
    await queryRunner.query(`
      CREATE TABLE nf_pagamento (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID NOT NULL REFERENCES nota_fiscal(id) ON DELETE CASCADE,
        forma_pagamento VARCHAR(2) NOT NULL,
        valor DECIMAL(15,2) NOT NULL,
        tipo_integracao SMALLINT,
        cnpj_credenciadora VARCHAR(14),
        bandeira_cartao VARCHAR(2),
        autorizacao VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_nf_pagamento_nota_fiscal_id ON nf_pagamento(nota_fiscal_id)`);

    // Tabela nf_processing_log
    await queryRunner.query(`
      CREATE TABLE nf_processing_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nota_fiscal_id UUID REFERENCES nota_fiscal(id) ON DELETE SET NULL,
        chave_acesso VARCHAR(44) NOT NULL,
        stage VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        source nf_source,
        error_code VARCHAR(50),
        error_message TEXT,
        duration_ms INTEGER,
        attempt_number SMALLINT NOT NULL DEFAULT 1,
        trace_id VARCHAR(64),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_nf_processing_log_chave_acesso ON nf_processing_log(chave_acesso)`);
    await queryRunner.query(`CREATE INDEX idx_nf_processing_log_stage ON nf_processing_log(stage)`);
    await queryRunner.query(`CREATE INDEX idx_nf_processing_log_created_at ON nf_processing_log(created_at DESC)`);

    // Trigger updated_at
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ language 'plpgsql'
    `);
    await queryRunner.query(`
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
```

---

## 6. Repositories

### 6.1 `nota-fiscal.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { DataSource, Repository, Between, ILike } from 'typeorm';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
import { NfStatus } from '../../../common/enums/nf-status.enum';
import { NfSource } from '../../../common/enums/nf-source.enum';

export interface FindNfFilters {
  status?: NfStatus;
  source?: NfSource;
  dataEmissaoInicio?: Date;
  dataEmissaoFim?: Date;
  cnpjEmitente?: string;
  chaveAcesso?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class NotaFiscalRepository extends Repository<NotaFiscal> {
  constructor(private dataSource: DataSource) {
    super(NotaFiscal, dataSource.createEntityManager());
  }

  async findByChaveAcesso(chaveAcesso: string): Promise<NotaFiscal | null> {
    return this.findOne({
      where: { chaveAcesso },
      relations: ['emitente', 'destinatario', 'itens', 'transporte', 'pagamentos'],
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<NotaFiscal | null> {
    return this.findOne({ where: { idempotencyKey } });
  }

  async findWithFilters(filters: FindNfFilters): Promise<{ data: NotaFiscal[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.createQueryBuilder('nf')
      .leftJoinAndSelect('nf.emitente', 'emitente')
      .leftJoinAndSelect('nf.destinatario', 'destinatario');

    if (filters.status) {
      qb.andWhere('nf.status = :status', { status: filters.status });
    }
    if (filters.source) {
      qb.andWhere('nf.source = :source', { source: filters.source });
    }
    if (filters.dataEmissaoInicio && filters.dataEmissaoFim) {
      qb.andWhere('nf.dataEmissao BETWEEN :inicio AND :fim', {
        inicio: filters.dataEmissaoInicio,
        fim: filters.dataEmissaoFim,
      });
    }
    if (filters.cnpjEmitente) {
      qb.andWhere('emitente.cnpj = :cnpj', { cnpj: filters.cnpjEmitente });
    }
    if (filters.chaveAcesso) {
      qb.andWhere('nf.chaveAcesso = :chaveAcesso', { chaveAcesso: filters.chaveAcesso });
    }

    qb.orderBy('nf.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async updateStatus(id: string, status: NfStatus, errorMessage?: string): Promise<void> {
    const updateData: Partial<NotaFiscal> = { status };
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }
    if (status === NfStatus.COMPLETED) {
      updateData.processedAt = new Date();
    }
    await this.update(id, updateData);
  }

  async incrementRetryCount(id: string): Promise<void> {
    await this.increment({ id }, 'retryCount', 1);
  }

  async getStatusSummary(): Promise<{ status: NfStatus; count: number }[]> {
    return this.createQueryBuilder('nf')
      .select('nf.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('nf.status')
      .getRawMany();
  }
}
```

### 6.2 `nf-processing-log.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { NfProcessingLog } from '../entities/nf-processing-log.entity';

@Injectable()
export class NfProcessingLogRepository extends Repository<NfProcessingLog> {
  constructor(private dataSource: DataSource) {
    super(NfProcessingLog, dataSource.createEntityManager());
  }

  async logProcessingStep(params: {
    notaFiscalId?: string;
    chaveAcesso: string;
    stage: string;
    status: string;
    errorCode?: string;
    errorMessage?: string;
    durationMs?: number;
    attemptNumber?: number;
    traceId?: string;
    metadata?: Record<string, any>;
  }): Promise<NfProcessingLog> {
    const log = this.create({
      notaFiscalId: params.notaFiscalId || null,
      chaveAcesso: params.chaveAcesso,
      stage: params.stage,
      status: params.status,
      errorCode: params.errorCode || null,
      errorMessage: params.errorMessage || null,
      durationMs: params.durationMs || null,
      attemptNumber: params.attemptNumber || 1,
      traceId: params.traceId || null,
      metadata: params.metadata || {},
    });
    return this.save(log);
  }

  async getLogsByChaveAcesso(chaveAcesso: string): Promise<NfProcessingLog[]> {
    return this.find({
      where: { chaveAcesso },
      order: { createdAt: 'ASC' },
    });
  }

  async getFailedLogs(limit = 100): Promise<NfProcessingLog[]> {
    return this.find({
      where: { status: 'ERROR' },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
```

---

## 7. Estratégia de Versionamento de Schema

1. **Toda alteração de schema** é feita via migration TypeORM. Nunca alterar o banco manualmente.
2. **Nomear migrations** com timestamp + descrição: `1700000000001-AddColumnXToNotaFiscal.ts`.
3. **Migrations são imutáveis**: Uma vez aplicada em produção, nunca editar. Criar nova migration para ajustes.
4. **Rollback**: Toda migration implementa `down()` com reversão exata.
5. **CI/CD**: Pipeline roda `typeorm migration:run` automaticamente no deploy.
6. **Comando para gerar migration**:
   ```bash
   npx typeorm migration:generate -d src/infrastructure/database/typeorm.config.ts migrations/NomeDaMigration
   ```
7. **Comando para rodar migrations**:
   ```bash
   npx typeorm migration:run -d src/infrastructure/database/typeorm.config.ts
   ```
