import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthService } from '@context/platform/infrastructure/health/health.service';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { RedisService } from '@infra/redis/redis.service';

describe('HealthService', () => {
  let service: HealthService;
  let dataSource: { query: jest.Mock };
  let rabbit: { verifyTopology: jest.Mock };
  let redis: { ping: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    rabbit = { verifyTopology: jest.fn().mockResolvedValue(undefined) };
    redis = { ping: jest.fn().mockResolvedValue('PONG') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: RabbitMQService, useValue: rabbit },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(HealthService);
  });

  it('returns ok when all dependencies are up', async () => {
    const report = await service.getReadiness();
    expect(report.status).toBe('ok');
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.rabbitmq.status).toBe('up');
    expect(report.checks.redis.status).toBe('up');
  });

  it('returns degraded when database fails', async () => {
    dataSource.query.mockRejectedValueOnce(new Error('db down'));
    const report = await service.getReadiness();
    expect(report.status).toBe('degraded');
    expect(report.checks.database.status).toBe('down');
  });

  it('returns degraded when rabbitmq fails', async () => {
    rabbit.verifyTopology.mockRejectedValueOnce(new Error('amqp down'));
    const report = await service.getReadiness();
    expect(report.status).toBe('degraded');
    expect(report.checks.rabbitmq.status).toBe('down');
  });

  it('returns degraded when redis fails', async () => {
    redis.ping.mockRejectedValueOnce(new Error('redis down'));
    const report = await service.getReadiness();
    expect(report.status).toBe('degraded');
    expect(report.checks.redis.status).toBe('down');
  });

  it('returns degraded when shutting down without calling dependencies', async () => {
    service.beginShutdown();
    const report = await service.getReadiness();
    expect(report.status).toBe('degraded');
    expect(report.checks.database.detail).toBe('application shutting down');
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(rabbit.verifyTopology).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });
});
