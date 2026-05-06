import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { NfReceiverService } from '@context/ingestion/application/services/nf-receiver.service';
import { NfSource } from '@shared/enums/nf-source.enum';

@Injectable()
export class EmailConsumerService implements OnModuleInit {
  private readonly logger = new Logger(EmailConsumerService.name);
  private readonly enabled: boolean;
  private readonly mockEnabled: boolean;
  private readonly mockXmlPath: string;
  private readonly mockFixture: string;
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly configService: ConfigService,
    private readonly nfReceiverService: NfReceiverService,
  ) {
    this.enabled = this.configService.get<boolean>('IMAP_ENABLED', false);
    this.mockEnabled = this.configService.get<boolean>('IMAP_MOCK_ENABLED', false);
    this.mockXmlPath = this.configService.get<string>('IMAP_MOCK_XML_PATH', '');
    this.mockFixture = this.configService.get<string>('IMAP_MOCK_FIXTURE', '');
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Email consumer is DISABLED');
      return;
    }

    if (this.mockEnabled) {
      this.logger.warn('Email consumer started in MOCK mode (development only)');
      this.pollEmails();
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
    if (!this.mockEnabled) {
      this.logger.debug('IMAP fetch not implemented - returning empty');
      return [];
    }

    this.logger.warn('IMAP MOCK: loading local XML files (development only)');

    const results: string[] = [];

    const pathResults = await this.loadFromPaths();
    results.push(...pathResults);

    const fixtureResults = await this.loadFromFixtures();
    results.push(...fixtureResults);

    if (results.length === 0) {
      this.logger.warn('IMAP MOCK: no XML files loaded from configured sources');
    } else {
      this.logger.warn(`IMAP MOCK: loaded ${results.length} XML file(s)`);
    }

    return results;
  }

  private async loadFromPaths(): Promise<string[]> {
    if (!this.mockXmlPath) return [];

    const results: string[] = [];
    const entries = this.mockXmlPath
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const entry of entries) {
      try {
        const stat = await fs.stat(entry);
        if (stat.isDirectory()) {
          const files = await fs.readdir(entry);
          const xmlFiles = files.filter((f) => f.endsWith('.xml')).sort();
          for (const file of xmlFiles) {
            const content = await this.readXmlFile(path.join(entry, file));
            if (content) results.push(content);
          }
        } else {
          const content = await this.readXmlFile(entry);
          if (content) results.push(content);
        }
      } catch (error) {
        this.logger.warn(`IMAP MOCK: skipping invalid path "${entry}": ${(error as Error).message}`);
      }
    }

    return results;
  }

  private async loadFromFixtures(): Promise<string[]> {
    if (!this.mockFixture) return [];

    const results: string[] = [];
    const names = this.mockFixture
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const name of names) {
      const candidates = [
        path.join(process.cwd(), 'src', 'test', 'fixtures', `${name}.xml`),
        path.join(process.cwd(), 'test', 'fixtures', `${name}.xml`),
      ];
      let content: string | null = null;
      for (const filePath of candidates) {
        content = await this.readXmlFile(filePath);
        if (content) break;
      }
      if (content) results.push(content);
    }

    return results;
  }

  private async readXmlFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      this.logger.warn(`IMAP MOCK: failed to read "${filePath}": ${(error as Error).message}`);
      return null;
    }
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }
}
