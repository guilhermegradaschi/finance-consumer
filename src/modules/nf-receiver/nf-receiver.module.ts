import { Module } from '@nestjs/common';
import { NfReceiverService } from './nf-receiver.service';

@Module({
  providers: [NfReceiverService],
  exports: [NfReceiverService],
})
export class NfReceiverModule {}
