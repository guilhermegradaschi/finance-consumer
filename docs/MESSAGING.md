# MESSAGING.md — Arquitetura RabbitMQ, Eventos e Configuração

## 1. Arquitetura de Filas

### 1.1 Topology

```
Exchange: nf.events (type: topic, durable: true)
│
├─ Routing Key: nf.received ──────► Queue: nf.xml-processor.queue
│                                    │ DLQ: nf.xml-processor.dlq
│                                    │ TTL retry: nf.xml-processor.retry (TTL 5000ms)
│
├─ Routing Key: nf.processed ─────► Queue: nf.business-validator.queue
│                                    │ DLQ: nf.business-validator.dlq
│                                    │ TTL retry: nf.business-validator.retry (TTL 5000ms)
│
├─ Routing Key: nf.validated ─────► Queue: nf.persistence.queue
│                                    │ DLQ: nf.persistence.dlq
│                                    │ TTL retry: nf.persistence.retry (TTL 5000ms)
│
├─ Routing Key: nf.persisted ─────► Queue: nf.notification.queue
│                                    │ DLQ: nf.notification.dlq
│
└─ Routing Key: nf.failed ────────► Queue: nf.failed.queue (para alertas)

Exchange: nf.retry (type: direct, durable: true)
│
├─ Routing Key: retry.xml-processor ──► Queue: nf.xml-processor.retry
│                                        (x-dead-letter-exchange: nf.events)
│                                        (x-dead-letter-routing-key: nf.received)
│                                        (x-message-ttl: calculado por attempt)
│
├─ Routing Key: retry.business-validator ► Queue: nf.business-validator.retry
│                                           (x-dead-letter-exchange: nf.events)
│                                           (x-dead-letter-routing-key: nf.processed)
│
└─ Routing Key: retry.persistence ──────► Queue: nf.persistence.retry
                                          (x-dead-letter-exchange: nf.events)
                                          (x-dead-letter-routing-key: nf.validated)

Exchange: nf.dlq (type: direct, durable: true)
│
├─ Routing Key: dlq.xml-processor ────► Queue: nf.xml-processor.dlq
├─ Routing Key: dlq.business-validator ► Queue: nf.business-validator.dlq
└─ Routing Key: dlq.persistence ──────► Queue: nf.persistence.dlq
```

### 1.2 Configuração de Exchanges

| Exchange    | Tipo   | Durable | Auto-Delete | Descrição                          |
|-------------|--------|---------|-------------|------------------------------------|
| nf.events   | topic  | true    | false       | Exchange principal de eventos      |
| nf.retry    | direct | true    | false       | Exchange para retry com delay      |
| nf.dlq      | direct | true    | false       | Exchange para dead-letter queues   |

### 1.3 Configuração de Queues

| Queue                           | Durable | Prefetch | x-dead-letter-exchange | x-dead-letter-routing-key       | x-message-ttl |
|---------------------------------|---------|----------|------------------------|---------------------------------|----------------|
| nf.xml-processor.queue          | true    | 10       | nf.dlq                 | dlq.xml-processor               | -              |
| nf.xml-processor.retry          | true    | -        | nf.events              | nf.received                     | 5000           |
| nf.xml-processor.dlq            | true    | 1        | -                      | -                               | -              |
| nf.business-validator.queue     | true    | 5        | nf.dlq                 | dlq.business-validator          | -              |
| nf.business-validator.retry     | true    | -        | nf.events              | nf.processed                    | 5000           |
| nf.business-validator.dlq       | true    | 1        | -                      | -                               | -              |
| nf.persistence.queue            | true    | 10       | nf.dlq                 | dlq.persistence                 | -              |
| nf.persistence.retry            | true    | -        | nf.events              | nf.validated                    | 5000           |
| nf.persistence.dlq              | true    | 1        | -                      | -                               | -              |
| nf.notification.queue           | true    | 5        | -                      | -                               | -              |
| nf.failed.queue                 | true    | 1        | -                      | -                               | -              |

---

## 2. Contratos de Eventos

### 2.1 Evento `nf.received`

Publicado por: `NfReceiverService`, `EmailConsumerService`, `S3ListenerService`
Consumido por: `XmlProcessorConsumer`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NfReceivedEvent",
  "type": "object",
  "required": ["eventId", "timestamp", "source", "chaveAcesso", "xmlContent", "idempotencyKey"],
  "properties": {
    "eventId": {
      "type": "string",
      "format": "uuid",
      "description": "UUID único do evento para rastreabilidade"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp do momento de recebimento"
    },
    "source": {
      "type": "string",
      "enum": ["API", "EMAIL", "S3"],
      "description": "Canal de origem da NF-e"
    },
    "chaveAcesso": {
      "type": "string",
      "pattern": "^[0-9]{44}$",
      "description": "Chave de acesso de 44 dígitos da NF-e"
    },
    "xmlContent": {
      "type": "string",
      "description": "Conteúdo XML completo da NF-e (UTF-8)"
    },
    "idempotencyKey": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64,
      "description": "SHA-256 da chaveAcesso"
    },
    "traceId": {
      "type": "string",
      "description": "ID de trace OpenTelemetry para rastreamento distribuído"
    },
    "metadata": {
      "type": "object",
      "description": "Metadados adicionais (email remetente, S3 key original, etc.)",
      "properties": {
        "emailFrom": { "type": "string" },
        "emailSubject": { "type": "string" },
        "s3Bucket": { "type": "string" },
        "s3Key": { "type": "string" },
        "apiClientId": { "type": "string" },
        "receivedAt": { "type": "string", "format": "date-time" }
      }
    },
    "attemptNumber": {
      "type": "integer",
      "minimum": 1,
      "default": 1,
      "description": "Número da tentativa de processamento"
    }
  }
}
```

**Exemplo concreto:**

```json
{
  "eventId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2024-01-15T14:30:00.000Z",
  "source": "API",
  "chaveAcesso": "35240112345678000195550010000001231234567890",
  "xmlContent": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><nfeProc xmlns=\"http://www.portalfiscal.inf.br/nfe\" versao=\"4.00\">...</nfeProc>",
  "idempotencyKey": "a3f5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "metadata": {
    "apiClientId": "client-erp-001",
    "receivedAt": "2024-01-15T14:30:00.000Z"
  },
  "attemptNumber": 1
}
```

### 2.2 Evento `nf.processed`

Publicado por: `XmlProcessorService`
Consumido por: `BusinessValidatorConsumer`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NfProcessedEvent",
  "type": "object",
  "required": ["eventId", "timestamp", "chaveAcesso", "idempotencyKey", "notaFiscalId", "xmlS3Key", "extractedData"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "timestamp": { "type": "string", "format": "date-time" },
    "chaveAcesso": { "type": "string", "pattern": "^[0-9]{44}$" },
    "idempotencyKey": { "type": "string" },
    "notaFiscalId": { "type": "string", "format": "uuid", "description": "ID da NF criada na etapa de processamento XML" },
    "xmlS3Key": { "type": "string", "description": "Chave S3 onde o XML original foi armazenado" },
    "traceId": { "type": "string" },
    "attemptNumber": { "type": "integer", "minimum": 1 },
    "extractedData": {
      "type": "object",
      "description": "Metadados extraídos do XML",
      "required": ["numero", "serie", "dataEmissao", "cnpjEmitente", "valorTotal"],
      "properties": {
        "numero": { "type": "integer" },
        "serie": { "type": "integer" },
        "modelo": { "type": "string", "enum": ["55", "65"] },
        "dataEmissao": { "type": "string", "format": "date-time" },
        "naturezaOperacao": { "type": "string" },
        "tipoOperacao": { "type": "integer" },
        "cnpjEmitente": { "type": "string" },
        "razaoSocialEmitente": { "type": "string" },
        "cnpjDestinatario": { "type": "string" },
        "razaoSocialDestinatario": { "type": "string" },
        "valorTotal": { "type": "number" },
        "quantidadeItens": { "type": "integer" },
        "protocoloAutorizacao": { "type": "string" },
        "dataAutorizacao": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

### 2.3 Evento `nf.validated`

Publicado por: `BusinessValidatorService`
Consumido por: `PersistenceConsumer`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NfValidatedEvent",
  "type": "object",
  "required": ["eventId", "timestamp", "chaveAcesso", "idempotencyKey", "notaFiscalId", "xmlS3Key", "validationResults"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "timestamp": { "type": "string", "format": "date-time" },
    "chaveAcesso": { "type": "string", "pattern": "^[0-9]{44}$" },
    "idempotencyKey": { "type": "string" },
    "notaFiscalId": { "type": "string", "format": "uuid" },
    "xmlS3Key": { "type": "string" },
    "traceId": { "type": "string" },
    "attemptNumber": { "type": "integer", "minimum": 1 },
    "validationResults": {
      "type": "object",
      "properties": {
        "cnpjEmitenteValid": { "type": "boolean" },
        "cnpjEmitenteStatus": { "type": "string", "description": "ATIVA, BAIXADA, INAPTA, etc." },
        "cnpjDestinatarioValid": { "type": "boolean" },
        "sefazStatus": { "type": "string", "description": "Status da consulta SEFAZ" },
        "sefazProtocolo": { "type": "string" },
        "allValidationsPassed": { "type": "boolean" },
        "validationErrors": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "code": { "type": "string" },
              "message": { "type": "string" },
              "field": { "type": "string" }
            }
          }
        }
      }
    },
    "fullNfData": {
      "type": "object",
      "description": "Dados completos da NF extraídos do XML, prontos para persistência final"
    }
  }
}
```

### 2.4 Evento `nf.persisted`

Publicado por: `PersistenceService`
Consumido por: `NotificationConsumer` (futuro)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NfPersistedEvent",
  "type": "object",
  "required": ["eventId", "timestamp", "chaveAcesso", "notaFiscalId", "status"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "timestamp": { "type": "string", "format": "date-time" },
    "chaveAcesso": { "type": "string" },
    "notaFiscalId": { "type": "string", "format": "uuid" },
    "status": { "type": "string", "enum": ["COMPLETED", "FAILED"] },
    "traceId": { "type": "string" },
    "summary": {
      "type": "object",
      "properties": {
        "numero": { "type": "integer" },
        "serie": { "type": "integer" },
        "cnpjEmitente": { "type": "string" },
        "valorTotal": { "type": "number" },
        "quantidadeItens": { "type": "integer" }
      }
    }
  }
}
```

### 2.5 Evento `nf.failed`

Publicado por: Qualquer estágio que detecte falha irrecuperável.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NfFailedEvent",
  "type": "object",
  "required": ["eventId", "timestamp", "chaveAcesso", "failedStage", "errorCode", "errorMessage"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "timestamp": { "type": "string", "format": "date-time" },
    "chaveAcesso": { "type": "string" },
    "notaFiscalId": { "type": "string", "format": "uuid" },
    "failedStage": { "type": "string", "enum": ["XML_PROCESS", "BUSINESS_VALIDATE", "PERSIST"] },
    "errorCode": { "type": "string" },
    "errorMessage": { "type": "string" },
    "attemptNumber": { "type": "integer" },
    "traceId": { "type": "string" },
    "originalEvent": { "type": "object", "description": "Evento original que causou a falha" }
  }
}
```

---

## 3. Constants de Queues

```typescript
// src/common/constants/queues.constants.ts

export const EXCHANGES = {
  NF_EVENTS: 'nf.events',
  NF_RETRY: 'nf.retry',
  NF_DLQ: 'nf.dlq',
} as const;

export const ROUTING_KEYS = {
  NF_RECEIVED: 'nf.received',
  NF_PROCESSED: 'nf.processed',
  NF_VALIDATED: 'nf.validated',
  NF_PERSISTED: 'nf.persisted',
  NF_FAILED: 'nf.failed',
  RETRY_XML_PROCESSOR: 'retry.xml-processor',
  RETRY_BUSINESS_VALIDATOR: 'retry.business-validator',
  RETRY_PERSISTENCE: 'retry.persistence',
  DLQ_XML_PROCESSOR: 'dlq.xml-processor',
  DLQ_BUSINESS_VALIDATOR: 'dlq.business-validator',
  DLQ_PERSISTENCE: 'dlq.persistence',
} as const;

export const QUEUES = {
  XML_PROCESSOR: 'nf.xml-processor.queue',
  XML_PROCESSOR_RETRY: 'nf.xml-processor.retry',
  XML_PROCESSOR_DLQ: 'nf.xml-processor.dlq',
  BUSINESS_VALIDATOR: 'nf.business-validator.queue',
  BUSINESS_VALIDATOR_RETRY: 'nf.business-validator.retry',
  BUSINESS_VALIDATOR_DLQ: 'nf.business-validator.dlq',
  PERSISTENCE: 'nf.persistence.queue',
  PERSISTENCE_RETRY: 'nf.persistence.retry',
  PERSISTENCE_DLQ: 'nf.persistence.dlq',
  NOTIFICATION: 'nf.notification.queue',
  FAILED: 'nf.failed.queue',
} as const;

export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  MULTIPLIER: 4, // 1s, 4s, 16s
  MAX_DELAY_MS: 60000,
} as const;

export const PREFETCH_COUNTS = {
  XML_PROCESSOR: 10,
  BUSINESS_VALIDATOR: 5,
  PERSISTENCE: 10,
  NOTIFICATION: 5,
  DLQ: 1,
} as const;
```

---

## 4. Configuração RabbitMQ no NestJS

### 4.1 `rabbitmq.module.ts`

```typescript
import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RabbitMQService],
  exports: [RabbitMQService],
})
export class RabbitMQModule implements OnModuleInit {
  constructor(private readonly rabbitMQService: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMQService.connect();
    await this.rabbitMQService.setupTopology();
  }
}
```

### 4.2 `rabbitmq.service.ts`

```typescript
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { Connection, Channel, ConsumeMessage } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
  RETRY_CONFIG,
  PREFETCH_COUNTS,
} from '../../common/constants/queues.constants';

export interface PublishOptions {
  routingKey: string;
  message: Record<string, any>;
  headers?: Record<string, any>;
}

export interface ConsumeOptions {
  queue: string;
  prefetch?: number;
  handler: (msg: ConsumeMessage, parsedContent: any) => Promise<void>;
}

@Injectable()
export class RabbitMQService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: Connection | null = null;
  private publishChannel: Channel | null = null;
  private consumerChannels: Map<string, Channel> = new Map();

  constructor(private readonly configService: ConfigService) {}

  async connect(): Promise<void> {
    const url = this.configService.getOrThrow<string>('RABBITMQ_URL');

    this.connection = await amqplib.connect(url, {
      heartbeat: 60,
    });

    this.connection.on('error', (err) => {
      this.logger.error('RabbitMQ connection error', err.message);
    });

    this.connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed. Attempting reconnect...');
      setTimeout(() => this.connect(), 5000);
    });

    this.publishChannel = await this.connection.createChannel();
    await this.publishChannel.confirm();

    this.logger.log('RabbitMQ connected successfully');
  }

  async setupTopology(): Promise<void> {
    const ch = this.publishChannel!;

    // Exchanges
    await ch.assertExchange(EXCHANGES.NF_EVENTS, 'topic', { durable: true });
    await ch.assertExchange(EXCHANGES.NF_RETRY, 'direct', { durable: true });
    await ch.assertExchange(EXCHANGES.NF_DLQ, 'direct', { durable: true });

    // XML Processor queues
    await ch.assertQueue(QUEUES.XML_PROCESSOR, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.NF_DLQ,
        'x-dead-letter-routing-key': ROUTING_KEYS.DLQ_XML_PROCESSOR,
      },
    });
    await ch.assertQueue(QUEUES.XML_PROCESSOR_RETRY, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.NF_EVENTS,
        'x-dead-letter-routing-key': ROUTING_KEYS.NF_RECEIVED,
        'x-message-ttl': RETRY_CONFIG.INITIAL_DELAY_MS,
      },
    });
    await ch.assertQueue(QUEUES.XML_PROCESSOR_DLQ, { durable: true });

    // Business Validator queues
    await ch.assertQueue(QUEUES.BUSINESS_VALIDATOR, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.NF_DLQ,
        'x-dead-letter-routing-key': ROUTING_KEYS.DLQ_BUSINESS_VALIDATOR,
      },
    });
    await ch.assertQueue(QUEUES.BUSINESS_VALIDATOR_RETRY, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.NF_EVENTS,
        'x-dead-letter-routing-key': ROUTING_KEYS.NF_PROCESSED,
        'x-message-ttl': RETRY_CONFIG.INITIAL_DELAY_MS,
      },
    });
    await ch.assertQueue(QUEUES.BUSINESS_VALIDATOR_DLQ, { durable: true });

    // Persistence queues
    await ch.assertQueue(QUEUES.PERSISTENCE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.NF_DLQ,
        'x-dead-letter-routing-key': ROUTING_KEYS.DLQ_PERSISTENCE,
      },
    });
    await ch.assertQueue(QUEUES.PERSISTENCE_RETRY, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.NF_EVENTS,
        'x-dead-letter-routing-key': ROUTING_KEYS.NF_VALIDATED,
        'x-message-ttl': RETRY_CONFIG.INITIAL_DELAY_MS,
      },
    });
    await ch.assertQueue(QUEUES.PERSISTENCE_DLQ, { durable: true });

    // Notification & Failed queues
    await ch.assertQueue(QUEUES.NOTIFICATION, { durable: true });
    await ch.assertQueue(QUEUES.FAILED, { durable: true });

    // Bindings — nf.events exchange
    await ch.bindQueue(QUEUES.XML_PROCESSOR, EXCHANGES.NF_EVENTS, ROUTING_KEYS.NF_RECEIVED);
    await ch.bindQueue(QUEUES.BUSINESS_VALIDATOR, EXCHANGES.NF_EVENTS, ROUTING_KEYS.NF_PROCESSED);
    await ch.bindQueue(QUEUES.PERSISTENCE, EXCHANGES.NF_EVENTS, ROUTING_KEYS.NF_VALIDATED);
    await ch.bindQueue(QUEUES.NOTIFICATION, EXCHANGES.NF_EVENTS, ROUTING_KEYS.NF_PERSISTED);
    await ch.bindQueue(QUEUES.FAILED, EXCHANGES.NF_EVENTS, ROUTING_KEYS.NF_FAILED);

    // Bindings — retry exchange
    await ch.bindQueue(QUEUES.XML_PROCESSOR_RETRY, EXCHANGES.NF_RETRY, ROUTING_KEYS.RETRY_XML_PROCESSOR);
    await ch.bindQueue(QUEUES.BUSINESS_VALIDATOR_RETRY, EXCHANGES.NF_RETRY, ROUTING_KEYS.RETRY_BUSINESS_VALIDATOR);
    await ch.bindQueue(QUEUES.PERSISTENCE_RETRY, EXCHANGES.NF_RETRY, ROUTING_KEYS.RETRY_PERSISTENCE);

    // Bindings — DLQ exchange
    await ch.bindQueue(QUEUES.XML_PROCESSOR_DLQ, EXCHANGES.NF_DLQ, ROUTING_KEYS.DLQ_XML_PROCESSOR);
    await ch.bindQueue(QUEUES.BUSINESS_VALIDATOR_DLQ, EXCHANGES.NF_DLQ, ROUTING_KEYS.DLQ_BUSINESS_VALIDATOR);
    await ch.bindQueue(QUEUES.PERSISTENCE_DLQ, EXCHANGES.NF_DLQ, ROUTING_KEYS.DLQ_PERSISTENCE);

    this.logger.log('RabbitMQ topology setup complete');
  }

  async publish(options: PublishOptions): Promise<void> {
    const { routingKey, message, headers } = options;
    const content = Buffer.from(JSON.stringify(message));

    const published = this.publishChannel!.publish(
      EXCHANGES.NF_EVENTS,
      routingKey,
      content,
      {
        persistent: true,
        contentType: 'application/json',
        messageId: message.eventId || uuidv4(),
        timestamp: Date.now(),
        headers: {
          ...headers,
          'x-trace-id': message.traceId || '',
          'x-attempt-number': message.attemptNumber || 1,
        },
      },
    );

    if (!published) {
      await new Promise<void>((resolve) => this.publishChannel!.once('drain', resolve));
    }

    this.logger.debug(`Published message to ${routingKey}: ${message.eventId}`);
  }

  async publishToRetry(retryRoutingKey: string, message: Record<string, any>, attemptNumber: number): Promise<void> {
    const delay = Math.min(
      RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(RETRY_CONFIG.MULTIPLIER, attemptNumber - 1),
      RETRY_CONFIG.MAX_DELAY_MS,
    );

    const content = Buffer.from(JSON.stringify({ ...message, attemptNumber: attemptNumber + 1 }));

    this.publishChannel!.publish(EXCHANGES.NF_RETRY, retryRoutingKey, content, {
      persistent: true,
      contentType: 'application/json',
      expiration: delay.toString(),
      headers: {
        'x-retry-attempt': attemptNumber,
        'x-retry-delay-ms': delay,
      },
    });

    this.logger.warn(`Published retry message: attempt=${attemptNumber}, delay=${delay}ms, key=${retryRoutingKey}`);
  }

  async consume(options: ConsumeOptions): Promise<void> {
    const { queue, prefetch, handler } = options;
    const channel = await this.connection!.createChannel();
    await channel.prefetch(prefetch || 10);

    this.consumerChannels.set(queue, channel);

    await channel.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        await handler(msg, content);
        channel.ack(msg);
      } catch (error) {
        this.logger.error(`Error processing message from ${queue}: ${(error as Error).message}`);

        const attemptNumber = (msg.properties.headers?.['x-attempt-number'] as number) || 1;

        if (attemptNumber >= RETRY_CONFIG.MAX_ATTEMPTS) {
          // Enviar para DLQ via reject (já configurado via x-dead-letter-exchange)
          channel.reject(msg, false);
          this.logger.error(`Message sent to DLQ after ${attemptNumber} attempts`);
        } else {
          // Ack e publicar manualmente na retry queue com delay
          channel.ack(msg);
          const content = JSON.parse(msg.content.toString());
          const retryKey = this.getRetryRoutingKey(queue);
          if (retryKey) {
            await this.publishToRetry(retryKey, content, attemptNumber);
          }
        }
      }
    });

    this.logger.log(`Consumer started on queue: ${queue} (prefetch: ${prefetch || 10})`);
  }

  private getRetryRoutingKey(queue: string): string | null {
    const mapping: Record<string, string> = {
      [QUEUES.XML_PROCESSOR]: ROUTING_KEYS.RETRY_XML_PROCESSOR,
      [QUEUES.BUSINESS_VALIDATOR]: ROUTING_KEYS.RETRY_BUSINESS_VALIDATOR,
      [QUEUES.PERSISTENCE]: ROUTING_KEYS.RETRY_PERSISTENCE,
    };
    return mapping[queue] || null;
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down RabbitMQ connections...');

    for (const [queue, channel] of this.consumerChannels) {
      await channel.close();
      this.logger.log(`Consumer channel closed: ${queue}`);
    }

    if (this.publishChannel) {
      await this.publishChannel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }

    this.logger.log('RabbitMQ shutdown complete');
  }
}
```

---

## 5. Estratégia de Retry com Backoff Exponencial

### Fórmula

```
delay = min(INITIAL_DELAY_MS * MULTIPLIER^(attempt - 1), MAX_DELAY_MS)
```

Com `INITIAL_DELAY_MS = 1000`, `MULTIPLIER = 4`, `MAX_DELAY_MS = 60000`:

| Tentativa | Delay    |
|-----------|----------|
| 1         | 1.000ms  |
| 2         | 4.000ms  |
| 3         | 16.000ms |

Após 3 tentativas → mensagem vai para DLQ.

### Implementação no Consumer

```typescript
// Dentro do handler do consume:
// O RabbitMQService já implementa a lógica de retry no método consume().
// O consumer só precisa lançar exceção e o service cuida do retry/DLQ.

// Exemplo de consumer que delega retry ao RabbitMQService:
async handleMessage(msg: ConsumeMessage, content: NfReceivedEvent): Promise<void> {
  // Se algo falhar aqui, o RabbitMQService.consume() captura o erro,
  // verifica attemptNumber e decide entre retry ou DLQ.
  const result = await this.xmlProcessorService.process(content);
  if (!result.success) {
    throw new Error(result.errorMessage); // Trigger retry
  }
}
```

---

## 6. Tratamento de Erros em Mensageria

### 6.1 Classificação de Erros

| Tipo de Erro           | Ação                    | Exemplo                                      |
|------------------------|-------------------------|----------------------------------------------|
| **Transiente**         | Retry com backoff       | Timeout de rede, banco indisponível           |
| **Validação**          | DLQ imediato (sem retry)| XML inválido, chave de acesso malformada      |
| **Infraestrutura**     | Retry com backoff       | S3 unavailable, Redis down                    |
| **Negócio irreversível** | DLQ + evento nf.failed | CNPJ cancelado permanentemente                |

### 6.2 Implementação da Classificação

```typescript
// src/common/exceptions/retryable.exception.ts
export class RetryableException extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'RetryableException';
  }
}

// src/common/exceptions/non-retryable.exception.ts
export class NonRetryableException extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'NonRetryableException';
  }
}
```

### 6.3 Consumer com tratamento diferenciado

```typescript
// Exemplo de consumer que diferencia erros:
async handleMessage(msg: ConsumeMessage, content: any, channel: Channel): Promise<void> {
  try {
    await this.processMessage(content);
    channel.ack(msg);
  } catch (error) {
    if (error instanceof NonRetryableException) {
      // Rejeita sem retry — vai direto para DLQ
      channel.reject(msg, false);
      this.logger.error(`Non-retryable error: ${error.errorCode} — ${error.message}`);
      await this.publishFailedEvent(content, error);
    } else {
      // Erro transiente — delegar ao mecanismo de retry
      throw error; // RabbitMQService.consume() captura e faz retry
    }
  }
}
```

---

## 7. Monitoramento de Filas

### Métricas a coletar

```typescript
// Métricas expostas via OpenTelemetry/SigNoz:
// - rabbitmq.queue.messages_ready (por fila)
// - rabbitmq.queue.messages_unacked (por fila)
// - rabbitmq.consumer.processing_time_ms (histograma)
// - rabbitmq.consumer.success_count (counter)
// - rabbitmq.consumer.error_count (counter)
// - rabbitmq.consumer.retry_count (counter)
// - rabbitmq.dlq.message_count (gauge)
```

### Health Check RabbitMQ

```typescript
// Dentro do HealthController:
@Get('rabbitmq')
async checkRabbitMQ(): Promise<{ status: string }> {
  try {
    const isConnected = this.rabbitMQService.isConnected();
    return { status: isConnected ? 'ok' : 'disconnected' };
  } catch {
    return { status: 'error' };
  }
}
```
