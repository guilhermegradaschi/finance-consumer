import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NfReceiverService } from './nf-receiver.service';
import { SubmitIngestionService } from './submit-ingestion.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { NfeIngestion } from '../persistence/entities/nfe-ingestion.entity';
import { OutboxMessage } from '../persistence/entities/outbox-message.entity';

@Module({
  imports: [PersistenceModule, TypeOrmModule.forFeature([NfeIngestion, OutboxMessage])],
  providers: [NfReceiverService, SubmitIngestionService],
  exports: [NfReceiverService, SubmitIngestionService],
})
export class NfReceiverModule {}
