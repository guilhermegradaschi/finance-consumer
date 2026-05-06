import { Module, Global } from '@nestjs/common';
import { AppLoggerService } from '@infra/observability/logger.service';

@Global()
@Module({
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class ObservabilityModule {}
