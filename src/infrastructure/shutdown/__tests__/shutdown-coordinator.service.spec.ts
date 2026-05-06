import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { ShutdownCoordinatorService } from '@infra/shutdown/shutdown-coordinator.service';
import { HealthService } from '@context/platform/infrastructure/health/health.service';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';

describe('ShutdownCoordinatorService', () => {
  let service: ShutdownCoordinatorService;
  let health: { beginShutdown: jest.Mock };
  let rabbit: { drainConsumers: jest.Mock };
  let closeMock: jest.Mock;

  beforeEach(async () => {
    health = { beginShutdown: jest.fn() };
    rabbit = { drainConsumers: jest.fn().mockResolvedValue(undefined) };
    closeMock = jest.fn((cb: () => void) => cb());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShutdownCoordinatorService,
        { provide: HealthService, useValue: health },
        { provide: RabbitMQService, useValue: rabbit },
        {
          provide: HttpAdapterHost,
          useValue: {
            httpAdapter: {
              getHttpServer: () => ({ close: closeMock }),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => (key === 'SHUTDOWN_DRAIN_MS' ? 100 : def)),
          },
        },
      ],
    }).compile();

    service = module.get(ShutdownCoordinatorService);
  });

  it('marks health shutting down, closes HTTP server, and drains RabbitMQ', async () => {
    await service.beforeApplicationShutdown('SIGTERM');
    expect(health.beginShutdown).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
    expect(rabbit.drainConsumers).toHaveBeenCalledWith(100);
  });
});
