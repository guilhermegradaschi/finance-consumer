import { Module } from '@nestjs/common';
import { NfReceiverModule } from '../modules/nf-receiver/nf-receiver.module';
import { PersistenceModule } from '../modules/persistence/persistence.module';
import { AuditLogService } from './audit-log.service';
import { ReceiveNfUseCase } from './use-cases/receive-nf.use-case';
import { ListNfUseCase } from './use-cases/list-nf.use-case';
import { GetNfByIdUseCase } from './use-cases/get-nf-by-id.use-case';
import { GetNfSummaryUseCase } from './use-cases/get-nf-summary.use-case';
import { GetNfLogsUseCase } from './use-cases/get-nf-logs.use-case';
import { GetNfTimelineUseCase } from './use-cases/get-nf-timeline.use-case';
import { ReprocessNfUseCase } from './use-cases/reprocess-nf.use-case';

@Module({
  imports: [NfReceiverModule, PersistenceModule],
  providers: [
    AuditLogService,
    ReceiveNfUseCase,
    ListNfUseCase,
    GetNfByIdUseCase,
    GetNfSummaryUseCase,
    GetNfLogsUseCase,
    GetNfTimelineUseCase,
    ReprocessNfUseCase,
  ],
  exports: [
    AuditLogService,
    ReceiveNfUseCase,
    ListNfUseCase,
    GetNfByIdUseCase,
    GetNfSummaryUseCase,
    GetNfLogsUseCase,
    GetNfTimelineUseCase,
    ReprocessNfUseCase,
  ],
})
export class ApplicationModule {}
