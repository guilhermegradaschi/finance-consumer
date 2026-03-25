import { Module, Global } from '@nestjs/common';
import { AppLoggerService } from './logger.service';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  providers: [AppLoggerService, MetricsService],
  exports: [AppLoggerService, MetricsService],
})
export class ObservabilityModule {}
