import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HealthController } from './controllers/health.controller';
import { AuthController } from './controllers/auth.controller';
import { NfController } from './controllers/nf.controller';
import { IngestNfeController } from './controllers/ingest-nfe.controller';
import { ReprocessController } from './controllers/reprocess.controller';
import { AdminInvoiceReprocessController } from './controllers/admin-invoice-reprocess.controller';
import { NfReprocessService } from './services/nf-reprocess.service';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { AuditLogService } from '../../application/audit-log.service';
import { GetNfTimelineUseCase } from '../../application/use-cases/get-nf-timeline.use-case';
import { NfReceiverModule } from '../nf-receiver/nf-receiver.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { InvoiceEventsModule } from '../invoice-events/invoice-events.module';

@Module({
  imports: [
    NfReceiverModule,
    PersistenceModule,
    InvoiceEventsModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    NfController,
    IngestNfeController,
    ReprocessController,
    AdminInvoiceReprocessController,
  ],
  providers: [
    NfReprocessService,
    TokenBlacklistService,
    AuditLogService,
    GetNfTimelineUseCase,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ApiGatewayModule {}
