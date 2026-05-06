import { Module } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { InfrastructureModule } from '@infra/infrastructure.module';
import { IngestionModule } from '@context/ingestion/ingestion.module';
import { NfeLegacyWorkersModule } from '@context/nfe-legacy/nfe-legacy.workers.module';
import { InvoiceEventsModule } from '@context/invoice-events/invoice-events.module';
import { InvoiceModule } from '@context/invoice/invoice.module';
import { SchedulingModule } from '@infra/scheduling/scheduling.module';

@Module({
  imports: [
    SharedModule,
    InfrastructureModule,
    IngestionModule,
    NfeLegacyWorkersModule,
    InvoiceModule,
    InvoiceEventsModule,
    SchedulingModule,
  ],
})
export class IngestionRuntimeModule {}
