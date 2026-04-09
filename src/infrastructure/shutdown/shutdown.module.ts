import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { ShutdownCoordinatorService } from './shutdown-coordinator.service';

@Module({
  imports: [HealthModule],
  providers: [ShutdownCoordinatorService],
})
export class ShutdownModule {}
