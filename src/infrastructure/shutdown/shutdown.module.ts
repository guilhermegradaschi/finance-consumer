import { Module } from '@nestjs/common';
import { PlatformModule } from '@context/platform/platform.module';
import { ShutdownCoordinatorService } from '@infra/shutdown/shutdown-coordinator.service';

@Module({
  imports: [PlatformModule],
  providers: [ShutdownCoordinatorService],
})
export class ShutdownModule {}
