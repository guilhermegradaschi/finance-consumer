import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class S3Service implements OnModuleInit {
  private client!: S3Client;
  private bucket!: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.bucket = this.configService.get<string>('S3_BUCKET', 'nf-xmls');
    this.client = new S3Client({
      endpoint: this.configService.get<string>('S3_ENDPOINT', 'http://localhost:9000'),
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY', 'minioadmin'),
      },
      forcePathStyle: this.configService.get<boolean>('S3_FORCE_PATH_STYLE', true),
    });
    this.logger.log('S3 client initialized');
  }

  buildNfKey(chaveAcesso: string): string {
    const year = chaveAcesso.substring(2, 4);
    const month = chaveAcesso.substring(4, 6);
    return `nfe/${year}/${month}/${chaveAcesso}.xml`;
  }

  async upload(key: string, content: string | Buffer, contentType = 'application/xml'): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
      }),
    );
    this.logger.debug(`Uploaded: ${key}`);
  }

  async download(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    return this.streamToString(response.Body as Readable);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async listByPrefix(prefix: string): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      }),
    );
    return (response.Contents ?? []).map((obj) => obj.Key!).filter(Boolean);
  }

  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }
}
