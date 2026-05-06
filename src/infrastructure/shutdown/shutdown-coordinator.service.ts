import { BeforeApplicationShutdown, Injectable, Logger, Optional } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Server } from 'http';
import { HealthService } from '@context/platform/infrastructure/health/health.service';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';

@Injectable()
export class ShutdownCoordinatorService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ShutdownCoordinatorService.name);

  constructor(
    private readonly healthService: HealthService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly configService: ConfigService,
    @Optional() private readonly httpAdapterHost?: HttpAdapterHost,
  ) {}

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    const drainMs = this.configService.get<number>('SHUTDOWN_DRAIN_MS', 25000);
    this.logger.log(`Graceful shutdown (${signal ?? 'unknown'}) drain timeout ${drainMs}ms`);
    this.healthService.beginShutdown();
    await this.closeHttpServer();
    await this.rabbitMQService.drainConsumers(drainMs);
  }

  private closeHttpServer(): Promise<void> {
    const adapter = this.httpAdapterHost?.httpAdapter;
    const server = adapter?.getHttpServer?.() as Server | undefined;
    if (!server) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      server.close(() => resolve());
    });
  }
}
