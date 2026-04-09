import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { PipelineStage } from '../../common/constants/queues.constants';
import { MetricsService } from '../observability/metrics.service';
import { RabbitMQService } from './rabbitmq.service';

export abstract class BaseConsumer<T> implements OnApplicationBootstrap {
  private loggerInstance: Logger | undefined;

  protected get logger(): Logger {
    if (!this.loggerInstance) {
      this.loggerInstance = new Logger(this.constructor.name);
    }
    return this.loggerInstance;
  }

  protected abstract readonly queue: string;
  protected abstract readonly pipelineStage: PipelineStage;
  protected abstract readonly retryRoutingKey: string;
  protected abstract readonly dlqRoutingKey: string;

  constructor(
    protected readonly rabbitMQService: RabbitMQService,
    protected readonly metricsService: MetricsService,
  ) {}

  protected abstract parseMessage(payload: Record<string, unknown>): T;

  protected abstract handleMessage(event: T): Promise<void>;

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMQService.consume(
      this.queue,
      async (msg: Record<string, unknown>) => {
        const started = Date.now();
        const event = this.parseMessage(msg);
        await this.handleMessage(event);
        this.metricsService.recordProcessingDuration(this.pipelineStage, Date.now() - started);
        this.recordStageSuccess();
      },
      {
        retryRoutingKey: this.retryRoutingKey,
        dlqRoutingKey: this.dlqRoutingKey,
        pipelineStage: this.pipelineStage,
      },
    );
  }

  private recordStageSuccess(): void {
    switch (this.pipelineStage) {
      case 'xml':
        this.metricsService.nfProcessed();
        break;
      case 'business':
        this.metricsService.nfValidated();
        break;
      case 'persistence':
        this.metricsService.nfPersisted();
        break;
      default:
        break;
    }
  }
}
