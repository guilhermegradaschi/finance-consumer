import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MetricsService } from '../../../infrastructure/observability/metrics.service';

@Controller()
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  async metrics(@Res() res: Response): Promise<void> {
    const registry = this.metricsService.getRegistry();
    res.type(registry.contentType);
    res.send(await this.metricsService.getPrometheusText());
  }
}
