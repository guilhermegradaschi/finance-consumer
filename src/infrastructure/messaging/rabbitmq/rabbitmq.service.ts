import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { EXCHANGES, QUEUES, ROUTING_KEYS, RETRY_CONFIG } from '@shared/constants/queues.constants';

type AmqpConnection = amqplib.ChannelModel;
type AmqpChannel = amqplib.ConfirmChannel;

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection!: AmqpConnection;
  private channel!: AmqpChannel;
  private connected = false;
  private readonly consumerTags: string[] = [];
  private readonly logger = new Logger(RabbitMQService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.connect();
      await this.setupTopology();
    } catch (err) {
      this.logger.error(
        `Failed to connect to RabbitMQ: ${(err as Error).message}. The app will start without RabbitMQ — consumers will be inactive.`,
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
      this.logger.log('RabbitMQ connection closed');
    } catch (err) {
      this.logger.error('Error closing RabbitMQ', err);
    }
  }

  async connect(): Promise<void> {
    const host = this.configService.get<string>('RABBITMQ_HOST', 'localhost');
    const port = this.configService.get<number>('RABBITMQ_PORT', 5672);
    const username = this.configService.get<string>('RABBITMQ_USERNAME', 'nf_user');
    const password = this.configService.get<string>('RABBITMQ_PASSWORD', 'nf_password');
    const vhost = this.configService.get<string>('RABBITMQ_VHOST', 'nf_processor');

    const url = `amqp://${username}:${password}@${host}:${port}/${encodeURIComponent(vhost)}`;
    this.connection = await amqplib.connect(url);
    this.channel = await this.connection.createConfirmChannel();
    this.connected = true;

    const prefetch = this.configService.get<number>('RABBITMQ_PREFETCH', 10);
    await this.channel.prefetch(prefetch);

    this.connection.on('close', () => {
      this.connected = false;
      this.logger.warn('RabbitMQ connection closed, reconnecting...');
      setTimeout(
        () =>
          this.connect()
            .then(() => this.setupTopology())
            .catch((e) => this.logger.error(`Reconnection failed: ${(e as Error).message}`)),
        5000,
      );
    });

    this.connection.on('error', (err: Error) => {
      this.connected = false;
      this.logger.error('RabbitMQ connection error', err.message);
    });

    this.logger.log('RabbitMQ connected');
  }

  async setupTopology(): Promise<void> {
    const ch = this.channel;

    await ch.assertExchange(EXCHANGES.EVENTS, 'topic', { durable: true });
    await ch.assertExchange(EXCHANGES.RETRY, 'direct', { durable: true });
    await ch.assertExchange(EXCHANGES.DLQ, 'direct', { durable: true });

    await ch.assertQueue(QUEUES.NF_RECEIVED, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EXCHANGES.DLQ },
    });
    await ch.bindQueue(QUEUES.NF_RECEIVED, EXCHANGES.EVENTS, ROUTING_KEYS.NF_RECEIVED);

    await ch.assertQueue(QUEUES.NF_PROCESS_XML, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EXCHANGES.DLQ },
    });
    await ch.bindQueue(QUEUES.NF_PROCESS_XML, EXCHANGES.EVENTS, ROUTING_KEYS.NF_RECEIVED);

    await ch.assertQueue(QUEUES.NF_VALIDATE_BUSINESS, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EXCHANGES.DLQ },
    });
    await ch.bindQueue(QUEUES.NF_VALIDATE_BUSINESS, EXCHANGES.EVENTS, ROUTING_KEYS.NF_PROCESSED);

    await ch.assertQueue(QUEUES.NF_PERSIST, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EXCHANGES.DLQ },
    });
    await ch.bindQueue(QUEUES.NF_PERSIST, EXCHANGES.EVENTS, ROUTING_KEYS.NF_VALIDATED);

    await ch.assertQueue(QUEUES.NF_NOTIFY, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EXCHANGES.DLQ },
    });
    await ch.bindQueue(QUEUES.NF_NOTIFY, EXCHANGES.EVENTS, ROUTING_KEYS.NF_PERSISTED);

    await ch.assertQueue(QUEUES.NF_RETRY_XML, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.EVENTS,
        'x-dead-letter-routing-key': ROUTING_KEYS.NF_RECEIVED,
        'x-message-ttl': RETRY_CONFIG.INITIAL_DELAY_MS,
      },
    });
    await ch.bindQueue(QUEUES.NF_RETRY_XML, EXCHANGES.RETRY, 'retry.xml');

    await ch.assertQueue(QUEUES.NF_RETRY_BUSINESS, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.EVENTS,
        'x-dead-letter-routing-key': ROUTING_KEYS.NF_PROCESSED,
        'x-message-ttl': RETRY_CONFIG.INITIAL_DELAY_MS,
      },
    });
    await ch.bindQueue(QUEUES.NF_RETRY_BUSINESS, EXCHANGES.RETRY, 'retry.business');

    await ch.assertQueue(QUEUES.NF_RETRY_PERSIST, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.EVENTS,
        'x-dead-letter-routing-key': ROUTING_KEYS.NF_VALIDATED,
        'x-message-ttl': RETRY_CONFIG.INITIAL_DELAY_MS,
      },
    });
    await ch.bindQueue(QUEUES.NF_RETRY_PERSIST, EXCHANGES.RETRY, 'retry.persist');

    await ch.assertQueue(QUEUES.NF_DLQ_XML, { durable: true });
    await ch.bindQueue(QUEUES.NF_DLQ_XML, EXCHANGES.DLQ, 'dlq.xml');

    await ch.assertQueue(QUEUES.NF_DLQ_BUSINESS, { durable: true });
    await ch.bindQueue(QUEUES.NF_DLQ_BUSINESS, EXCHANGES.DLQ, 'dlq.business');

    await ch.assertQueue(QUEUES.NF_DLQ_PERSIST, { durable: true });
    await ch.bindQueue(QUEUES.NF_DLQ_PERSIST, EXCHANGES.DLQ, 'dlq.persist');

    await ch.assertExchange(EXCHANGES.NF_TOPIC, 'topic', { durable: true });
    await ch.bindQueue(QUEUES.NF_PROCESS_XML, EXCHANGES.NF_TOPIC, ROUTING_KEYS.NF_RECEIVED);
    await ch.bindQueue(QUEUES.NF_PROCESS_XML, EXCHANGES.NF_TOPIC, ROUTING_KEYS.INGEST_ACCEPTED);
    await ch.bindQueue(QUEUES.NF_VALIDATE_BUSINESS, EXCHANGES.NF_TOPIC, ROUTING_KEYS.NF_PROCESSED);
    await ch.bindQueue(QUEUES.NF_VALIDATE_BUSINESS, EXCHANGES.NF_TOPIC, ROUTING_KEYS.NFE_VALIDATE);
    await ch.bindQueue(QUEUES.NF_PERSIST, EXCHANGES.NF_TOPIC, ROUTING_KEYS.NF_VALIDATED);
    await ch.bindQueue(QUEUES.NF_PERSIST, EXCHANGES.NF_TOPIC, ROUTING_KEYS.NFE_PERSIST);
    await ch.bindQueue(QUEUES.NF_NOTIFY, EXCHANGES.NF_TOPIC, ROUTING_KEYS.NF_PERSISTED);

    this.logger.log('RabbitMQ topology setup complete');
  }

  async verifyTopology(): Promise<void> {
    if (!this.connected || !this.channel) {
      throw new Error('RabbitMQ is not connected');
    }
    await this.setupTopology();
  }

  async drainConsumers(timeoutMs: number): Promise<void> {
    if (!this.channel) {
      return;
    }
    const tags = [...this.consumerTags];
    this.consumerTags.length = 0;
    for (const tag of tags) {
      try {
        await this.channel.cancel(tag);
      } catch (err) {
        this.logger.warn(`Failed to cancel consumer ${tag}: ${(err as Error).message}`);
      }
    }
    if (timeoutMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    }
  }

  private ensureChannel(): AmqpChannel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available. Is RabbitMQ running?');
    }
    return this.channel;
  }

  async publish(
    exchange: string,
    routingKey: string,
    message: Record<string, unknown>,
    headers?: Record<string, unknown>,
  ): Promise<void> {
    const ch = this.ensureChannel();
    const content = Buffer.from(JSON.stringify(message));
    ch.publish(exchange, routingKey, content, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
      headers: headers ?? {},
    });
    await ch.waitForConfirms();
  }

  async publishToRetry(retryRoutingKey: string, message: Record<string, unknown>, attempt: number): Promise<void> {
    const ch = this.ensureChannel();
    const delay = RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(RETRY_CONFIG.MULTIPLIER, attempt - 1);
    const content = Buffer.from(JSON.stringify(message));

    ch.publish(EXCHANGES.RETRY, retryRoutingKey, content, {
      persistent: true,
      contentType: 'application/json',
      headers: { 'x-retry-count': attempt, 'x-delay': delay },
      expiration: String(delay),
    });
    await ch.waitForConfirms();
    this.logger.debug(`Published to retry: ${retryRoutingKey}, attempt: ${attempt}, delay: ${delay}ms`);
  }

  async publishToDlq(dlqRoutingKey: string, message: Record<string, unknown>, error: string): Promise<void> {
    const ch = this.ensureChannel();
    const content = Buffer.from(
      JSON.stringify({ ...message, dlqError: error, dlqTimestamp: new Date().toISOString() }),
    );
    ch.publish(EXCHANGES.DLQ, dlqRoutingKey, content, {
      persistent: true,
      contentType: 'application/json',
    });
    await ch.waitForConfirms();
    this.logger.warn(`Message sent to DLQ: ${dlqRoutingKey}`);
  }

  async consume(
    queue: string,
    handler: (msg: Record<string, unknown>, raw: amqplib.ConsumeMessage) => Promise<void>,
    options?: { retryRoutingKey?: string; dlqRoutingKey?: string; pipelineStage?: string },
  ): Promise<void> {
    if (!this.connected || !this.channel) {
      this.logger.warn(`Skipping consumer registration for queue "${queue}" — RabbitMQ is not connected`);
      return;
    }

    const ch = this.channel;
    const { consumerTag } = await ch.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString()) as Record<string, unknown>;
        await handler(content, msg);
        ch.ack(msg);
      } catch (error) {
        const retryCount = (msg.properties.headers?.['x-retry-count'] as number) ?? 0;

        if (retryCount < RETRY_CONFIG.MAX_RETRIES && options?.retryRoutingKey) {
          const content = JSON.parse(msg.content.toString()) as Record<string, unknown>;
          await this.publishToRetry(options.retryRoutingKey, content, retryCount + 1);
          ch.ack(msg);
        } else if (options?.dlqRoutingKey) {
          const content = JSON.parse(msg.content.toString()) as Record<string, unknown>;
          await this.publishToDlq(options.dlqRoutingKey, content, (error as Error).message);
          ch.ack(msg);
        } else {
          ch.nack(msg, false, false);
        }
      }
    });
    this.consumerTags.push(consumerTag);

    this.logger.log(`Consuming from queue: ${queue}`);
  }

  getChannel(): amqplib.ConfirmChannel {
    return this.channel;
  }
}
