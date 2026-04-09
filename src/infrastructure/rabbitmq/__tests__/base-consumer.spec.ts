import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DLQ_ROUTING_KEYS,
  PIPELINE_STAGES,
  QUEUES,
  RETRY_ROUTING_KEYS,
} from '../../../common/constants/queues.constants';
import { MetricsService } from '../../observability/metrics.service';
import { BaseConsumer } from '../base-consumer';
import { RabbitMQService } from '../rabbitmq.service';

type TestPayload = { chaveAcesso: string };

@Injectable()
class TestConsumer extends BaseConsumer<TestPayload> {
  handleMessageCalls: TestPayload[] = [];

  protected readonly queue = QUEUES.NF_PROCESS_XML;
  protected readonly pipelineStage = PIPELINE_STAGES.XML;
  protected readonly retryRoutingKey = RETRY_ROUTING_KEYS.XML;
  protected readonly dlqRoutingKey = DLQ_ROUTING_KEYS.XML;

  constructor(rabbitMQService: RabbitMQService, metricsService: MetricsService) {
    super(rabbitMQService, metricsService);
  }

  protected parseMessage(payload: Record<string, unknown>): TestPayload {
    return payload as TestPayload;
  }

  protected async handleMessage(event: TestPayload): Promise<void> {
    this.handleMessageCalls.push(event);
  }
}

describe('BaseConsumer', () => {
  let consumer: TestConsumer;
  let consumeHandler: (msg: Record<string, unknown>) => Promise<void>;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const mockRabbit = {
      consume: jest.fn().mockImplementation((_queue: string, handler: typeof consumeHandler) => {
        consumeHandler = handler;
        return Promise.resolve();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestConsumer,
        { provide: RabbitMQService, useValue: mockRabbit },
        MetricsService,
      ],
    }).compile();

    consumer = module.get(TestConsumer);
    metricsService = module.get(MetricsService);
    jest.spyOn(metricsService, 'recordProcessingDuration').mockImplementation(() => undefined);
    jest.spyOn(metricsService, 'nfProcessed').mockImplementation(() => undefined);
  });

  it('should register consume with retry, dlq and pipeline stage options', async () => {
    const rabbit = (consumer as unknown as { rabbitMQService: { consume: jest.Mock } }).rabbitMQService;
    await consumer.onApplicationBootstrap();
    expect(rabbit.consume).toHaveBeenCalledWith(
      QUEUES.NF_PROCESS_XML,
      expect.any(Function),
      expect.objectContaining({
        retryRoutingKey: RETRY_ROUTING_KEYS.XML,
        dlqRoutingKey: DLQ_ROUTING_KEYS.XML,
        pipelineStage: PIPELINE_STAGES.XML,
      }),
    );
  });

  it('should parse message, run handleMessage, record duration and nfProcessed on success', async () => {
    await consumer.onApplicationBootstrap();
    await consumeHandler({ chaveAcesso: 'abc' });
    expect(consumer.handleMessageCalls).toEqual([{ chaveAcesso: 'abc' }]);
    expect(metricsService.recordProcessingDuration).toHaveBeenCalledWith(PIPELINE_STAGES.XML, expect.any(Number));
    expect(metricsService.nfProcessed).toHaveBeenCalled();
  });
});
