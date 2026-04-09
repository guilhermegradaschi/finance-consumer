import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTracing } from './tracing';

@Injectable()
export class TracingShutdownHook implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownTracing();
  }
}
