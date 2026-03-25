import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NfReceiverService } from '../nf-receiver/nf-receiver.service';
import { NfSource } from '../../common/enums/nf-source.enum';

@Injectable()
export class EmailConsumerService implements OnModuleInit {
  private readonly logger = new Logger(EmailConsumerService.name);
  private readonly enabled: boolean;
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly configService: ConfigService,
    private readonly nfReceiverService: NfReceiverService,
  ) {
    this.enabled = this.configService.get<boolean>('IMAP_ENABLED', false);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Email consumer is DISABLED');
      return;
    }

    this.logger.log('Email consumer started - polling every 5 minutes');
    this.intervalHandle = setInterval(() => this.pollEmails(), 5 * 60 * 1000);
  }

  async pollEmails(): Promise<void> {
    this.logger.debug('Polling for new emails...');

    try {
      const xmlAttachments = await this.fetchUnseenEmails();

      for (const xml of xmlAttachments) {
        try {
          await this.nfReceiverService.receive({
            xmlContent: xml,
            source: NfSource.EMAIL,
          });
        } catch (error) {
          this.logger.error(`Failed to process email attachment: ${(error as Error).message}`);
        }
      }

      if (xmlAttachments.length > 0) {
        this.logger.log(`Processed ${xmlAttachments.length} XML attachments from email`);
      }
    } catch (error) {
      this.logger.error(`Email polling failed: ${(error as Error).message}`);
    }
  }

  private async fetchUnseenEmails(): Promise<string[]> {
    this.logger.debug('IMAP fetch not implemented in MVP - returning empty');
    return [];
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }
}
