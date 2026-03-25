import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3ListenerService } from './s3-listener.service';
import { NfReceiverModule } from '../nf-receiver/nf-receiver.module';

@Module({
  imports: [ConfigModule, NfReceiverModule],
  providers: [S3ListenerService],
})
export class S3ListenerModule {}
