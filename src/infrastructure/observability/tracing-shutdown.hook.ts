import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTracing } from '@infra/observability/tracing';

@Injectable()
export class TracingShutdownHook implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownTracing();
  }
}
