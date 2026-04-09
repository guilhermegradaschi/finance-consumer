import { Module } from '@nestjs/common';
import { NfReceiverService } from './nf-receiver.service';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  providers: [NfReceiverService],
  exports: [NfReceiverService],
})
export class NfReceiverModule {}
