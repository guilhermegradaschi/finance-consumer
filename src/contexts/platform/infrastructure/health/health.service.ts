import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { RedisService } from '@infra/redis/redis.service';

export interface HealthCheckResult {
  status: 'up' | 'down';
  detail?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    database: HealthCheckResult;
    rabbitmq: HealthCheckResult;
    redis: HealthCheckResult;
  };
}

@Injectable()
export class HealthService {
  private shuttingDown = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rabbitMQService: RabbitMQService,
    private readonly redisService: RedisService,
  ) {}

  beginShutdown(): void {
    this.shuttingDown = true;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async getReadiness(): Promise<HealthReport> {
    if (this.shuttingDown) {
      return {
        status: 'degraded',
        checks: {
          database: { status: 'down', detail: 'application shutting down' },
          rabbitmq: { status: 'down', detail: 'application shutting down' },
          redis: { status: 'down', detail: 'application shutting down' },
        },
      };
    }

    const [database, rabbitmq, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRabbitMq(),
      this.checkRedis(),
    ]);

    const allUp = database.status === 'up' && rabbitmq.status === 'up' && redis.status === 'up';

    return {
      status: allUp ? 'ok' : 'degraded',
      checks: { database, rabbitmq, redis },
    };
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up' };
    } catch (err) {
      return { status: 'down', detail: (err as Error).message };
    }
  }

  private async checkRabbitMq(): Promise<HealthCheckResult> {
    try {
      await this.rabbitMQService.verifyTopology();
      return { status: 'up' };
    } catch (err) {
      return { status: 'down', detail: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    try {
      const pong = await this.redisService.ping();
      if (pong !== 'PONG') {
        return { status: 'down', detail: `unexpected ping reply: ${pong}` };
      }
      return { status: 'up' };
    } catch (err) {
      return { status: 'down', detail: (err as Error).message };
    }
  }
}
