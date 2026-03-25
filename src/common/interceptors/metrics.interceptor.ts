import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../../infrastructure/observability/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const handler = context.getHandler().name;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        this.metricsService.recordHistogram('http.request.duration_ms', duration, { handler });
      }),
    );
  }
}
