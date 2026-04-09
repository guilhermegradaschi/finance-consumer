export const EXCHANGES = {
  EVENTS: 'nf.events',
  RETRY: 'nf.retry',
  DLQ: 'nf.dlq',
  INVOICE: 'invoice.events',
  INVOICE_RETRY: 'invoice.retry',
  INVOICE_DLQ: 'invoice.dlq',
} as const;

export const QUEUES = {
  NF_RECEIVED: 'nf.received',
  NF_PROCESS_XML: 'nf.process.xml',
  NF_VALIDATE_BUSINESS: 'nf.validate.business',
  NF_PERSIST: 'nf.persist',
  NF_NOTIFY: 'nf.notify',
  NF_RETRY_XML: 'nf.retry.xml',
  NF_RETRY_BUSINESS: 'nf.retry.business',
  NF_RETRY_PERSIST: 'nf.retry.persist',
  NF_DLQ_XML: 'nf.dlq.xml',
  NF_DLQ_BUSINESS: 'nf.dlq.business',
  NF_DLQ_PERSIST: 'nf.dlq.persist',
  INVOICE_IMPORT_PROCESS: 'invoice.import.process',
  INVOICE_EVENTS_PROCESS: 'invoice.events.process',
  INVOICE_DLQ_IMPORT: 'invoice.dlq.import',
  INVOICE_DLQ_EVENTS: 'invoice.dlq.events',
} as const;

export const ROUTING_KEYS = {
  NF_RECEIVED: 'nf.received',
  NF_PROCESSED: 'nf.processed',
  NF_VALIDATED: 'nf.validated',
  NF_PERSISTED: 'nf.persisted',
  NF_FAILED: 'nf.failed',
  INVOICE_IMPORT_COMPLETED: 'invoice.import.completed',
  INVOICE_EVENTS_IMPORTED: 'invoice.events.imported',
} as const;

export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 1000,
  MULTIPLIER: 4,
} as const;

export type PipelineStage = 'xml' | 'business' | 'persistence' | 'notify';
