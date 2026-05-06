import { Module } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { InfrastructureModule } from '@infra/infrastructure.module';
import { PlatformModule } from '@context/platform/platform.module';
import { NfeLegacyHttpModule } from '@context/nfe-legacy/nfe-legacy.http.module';
import { IngestionHttpModule } from '@context/ingestion/ingestion.http.module';
import { InvoiceHttpModule } from '@context/invoice/invoice.http.module';

@Module({
  imports: [
    SharedModule,
    InfrastructureModule,
    PlatformModule,
    NfeLegacyHttpModule,
    IngestionHttpModule,
    InvoiceHttpModule,
  ],
})
export class ApiModule {}
