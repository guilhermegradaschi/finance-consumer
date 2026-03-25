import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailConsumerService } from './email-consumer.service';
import { NfReceiverModule } from '../nf-receiver/nf-receiver.module';

@Module({
  imports: [ConfigModule, NfReceiverModule],
  providers: [EmailConsumerService],
})
export class EmailConsumerModule {
  static register() {
    return {
      module: EmailConsumerModule,
      imports: [ConfigModule, NfReceiverModule],
      providers: [
        {
          provide: 'EMAIL_ENABLED',
          inject: [ConfigService],
          useFactory: (config: ConfigService) => config.get<boolean>('IMAP_ENABLED', false),
        },
        EmailConsumerService,
      ],
    };
  }
}
