import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue({}),
  assertQueue: jest.fn().mockResolvedValue({}),
  bindQueue: jest.fn().mockResolvedValue({}),
  prefetch: jest.fn().mockResolvedValue({}),
  publish: jest.fn().mockReturnValue(true),
  waitForConfirms: jest.fn().mockResolvedValue(undefined),
  consume: jest.fn().mockResolvedValue({ consumerTag: 'test' }),
  ack: jest.fn(),
  nack: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockConnection = {
  createConfirmChannel: jest.fn().mockResolvedValue(mockChannel),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('amqplib', () => ({
  connect: jest.fn().mockImplementation(() => Promise.resolve(mockConnection)),
}));

import { RabbitMQService } from '../rabbitmq.service';

describe('RabbitMQService', () => {
  let service: RabbitMQService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConnection.createConfirmChannel.mockResolvedValue(mockChannel);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                RABBITMQ_HOST: 'localhost',
                RABBITMQ_PORT: 5672,
                RABBITMQ_USERNAME: 'nf_user',
                RABBITMQ_PASSWORD: 'nf_password',
                RABBITMQ_VHOST: 'nf_processor',
                RABBITMQ_PREFETCH: 10,
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
    await service.onModuleInit();
  });

  it('should connect and setup topology with nf.events, nf.topic, retry, dlq and queues', () => {
    expect(mockChannel.assertExchange).toHaveBeenCalledTimes(4);
    expect(mockChannel.assertQueue).toHaveBeenCalledTimes(11);
    expect(mockChannel.bindQueue).toHaveBeenCalledTimes(18);
  });

  it('should publish a message to an exchange', async () => {
    await service.publish('nf.events', 'nf.received', { test: true });
    expect(mockChannel.publish).toHaveBeenCalledWith(
      'nf.events',
      'nf.received',
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, contentType: 'application/json' }),
    );
    expect(mockChannel.waitForConfirms).toHaveBeenCalled();
  });

  it('should publish to retry with exponential backoff headers', async () => {
    await service.publishToRetry('retry.xml', { test: true }, 1);
    expect(mockChannel.publish).toHaveBeenCalledWith(
      'nf.retry',
      'retry.xml',
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({ 'x-retry-count': 1 }),
      }),
    );
  });

  it('should publish to DLQ with error info', async () => {
    await service.publishToDlq('dlq.xml', { test: true }, 'some error');
    expect(mockChannel.publish).toHaveBeenCalledWith(
      'nf.dlq',
      'dlq.xml',
      expect.any(Buffer),
      expect.objectContaining({ persistent: true }),
    );
  });

  it('should consume messages from a queue', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await service.consume('nf.process.xml', handler);
    expect(mockChannel.consume).toHaveBeenCalledWith('nf.process.xml', expect.any(Function));
  });

  it('should gracefully shutdown on module destroy', async () => {
    await service.onModuleDestroy();
    expect(mockChannel.close).toHaveBeenCalled();
    expect(mockConnection.close).toHaveBeenCalled();
  });
});
