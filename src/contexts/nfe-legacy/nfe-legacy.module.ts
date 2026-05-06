import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotaFiscal } from '@context/nfe-legacy/domain/entities/nota-fiscal.entity';
import { NfItem } from '@context/nfe-legacy/domain/entities/nf-item.entity';
import { NfEmitente } from '@context/nfe-legacy/domain/entities/nf-emitente.entity';
import { NfDestinatario } from '@context/nfe-legacy/domain/entities/nf-destinatario.entity';
import { NfTransporte } from '@context/nfe-legacy/domain/entities/nf-transporte.entity';
import { NfPagamento } from '@context/nfe-legacy/domain/entities/nf-pagamento.entity';
import { NfProcessingLog } from '@context/nfe-legacy/domain/entities/nf-processing-log.entity';
import { NotaFiscalRepository } from '@context/nfe-legacy/domain/repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from '@context/nfe-legacy/domain/repositories/nf-processing-log.repository';
import { PersistenceService } from '@context/nfe-legacy/application/services/persistence.service';
import { AuditLogService } from '@context/nfe-legacy/application/services/audit-log.service';
import { NfReprocessService } from '@context/nfe-legacy/application/services/nf-reprocess.service';
import { ReceiveNfUseCase } from '@context/nfe-legacy/application/use-cases/receive-nf.use-case';
import { ListNfUseCase } from '@context/nfe-legacy/application/use-cases/list-nf.use-case';
import { GetNfByIdUseCase } from '@context/nfe-legacy/application/use-cases/get-nf-by-id.use-case';
import { GetNfSummaryUseCase } from '@context/nfe-legacy/application/use-cases/get-nf-summary.use-case';
import { GetNfLogsUseCase } from '@context/nfe-legacy/application/use-cases/get-nf-logs.use-case';
import { GetNfTimelineUseCase } from '@context/nfe-legacy/application/use-cases/get-nf-timeline.use-case';
import { ReprocessNfUseCase } from '@context/nfe-legacy/application/use-cases/reprocess-nf.use-case';
import { XmlProcessorService } from '@context/nfe-legacy/infrastructure/xml/xml-processor.service';
import { NfeXsdValidationService } from '@context/nfe-legacy/infrastructure/xml/nfe-xsd-validation.service';
import { BusinessValidatorService } from '@context/nfe-legacy/infrastructure/sefaz/business-validator.service';
import { SefazClient } from '@context/nfe-legacy/infrastructure/sefaz/sefaz.client';
import { ReceitaWsClient } from '@context/nfe-legacy/infrastructure/sefaz/receita-ws.client';
import { IngestionModule } from '@context/ingestion/ingestion.module';

const legacyEntities = [NotaFiscal, NfItem, NfEmitente, NfDestinatario, NfTransporte, NfPagamento, NfProcessingLog];

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature(legacyEntities), forwardRef(() => IngestionModule)],
  providers: [
    NotaFiscalRepository,
    NfProcessingLogRepository,
    PersistenceService,
    AuditLogService,
    NfReprocessService,
    ReceiveNfUseCase,
    ListNfUseCase,
    GetNfByIdUseCase,
    GetNfSummaryUseCase,
    GetNfLogsUseCase,
    GetNfTimelineUseCase,
    ReprocessNfUseCase,
    XmlProcessorService,
    NfeXsdValidationService,
    BusinessValidatorService,
    SefazClient,
    ReceitaWsClient,
  ],
  exports: [
    TypeOrmModule,
    NotaFiscalRepository,
    NfProcessingLogRepository,
    PersistenceService,
    AuditLogService,
    XmlProcessorService,
    NfeXsdValidationService,
    BusinessValidatorService,
    GetNfTimelineUseCase,
  ],
})
export class NfeLegacyModule {}
