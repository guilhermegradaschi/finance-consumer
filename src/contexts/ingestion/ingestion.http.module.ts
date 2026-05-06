import { Module } from '@nestjs/common';
import { IngestNfeController } from '@context/ingestion/infrastructure/http/ingest-nfe.controller';
import { IngestionModule } from '@context/ingestion/ingestion.module';

@Module({
  imports: [IngestionModule],
  controllers: [IngestNfeController],
})
export class IngestionHttpModule {}
