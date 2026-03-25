import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { NfReceiverService } from '../nf-receiver/nf-receiver.service';
import { NfSource } from '../../common/enums/nf-source.enum';

@Injectable()
export class S3ListenerService implements OnModuleInit {
  private readonly logger = new Logger(S3ListenerService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
    private readonly nfReceiverService: NfReceiverService,
  ) {
    this.enabled = this.configService.get<boolean>('SQS_ENABLED', false);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('S3 Listener is DISABLED');
      return;
    }

    this.logger.log('S3 Listener started');
    this.startPolling();
  }

  private startPolling(): void {
    this.logger.debug('SQS long-polling not implemented in MVP');
  }

  async processS3Event(bucketName: string, objectKey: string): Promise<void> {
    this.logger.log(`Processing S3 event: ${bucketName}/${objectKey}`);

    try {
      const xmlContent = await this.s3Service.download(objectKey);

      await this.nfReceiverService.receive({
        xmlContent,
        source: NfSource.S3,
        metadata: { s3Bucket: bucketName, s3Key: objectKey },
      });

      this.logger.log(`S3 event processed: ${objectKey}`);
    } catch (error) {
      this.logger.error(`Failed to process S3 event: ${(error as Error).message}`);
      throw error;
    }
  }
}
