import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import AdmZip from 'adm-zip';
import { ExternalInvoiceCreatorService } from './external-invoice-creator.service';
import { SubmitIngestionService } from '../nf-receiver/submit-ingestion.service';
import { InvoiceImport } from '../persistence/entities/invoice-import.entity';
import { InvoiceImportLog } from '../persistence/entities/invoice-import-log.entity';
import { InvoiceImportStatus } from '../../common/enums/invoice-import-status.enum';
import { InvoiceImportLogStatus } from '../../common/enums/invoice-import-log-status.enum';
import { ExternalInvoiceSource } from '../../common/enums/external-invoice-source.enum';
import { NfSource } from '../../common/enums/nf-source.enum';
import { extractChaveAcessoFromXml } from '../../common/utils/xml.util';

const ALLOWED_EXT = new Set(['.xml', '.zip']);

export type ImapEmailPayload = {
  xml: string;
  accessKey: string;
  from: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class ImapImporterService {
  private readonly logger = new Logger(ImapImporterService.name);
  private readonly enabled: boolean;
  private readonly useSubmitIngestion: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly externalInvoiceCreator: ExternalInvoiceCreatorService,
    private readonly submitIngestionService: SubmitIngestionService,
    @InjectRepository(InvoiceImport)
    private readonly invoiceImportRepo: Repository<InvoiceImport>,
    @InjectRepository(InvoiceImportLog)
    private readonly invoiceImportLogRepo: Repository<InvoiceImportLog>,
  ) {
    this.enabled = this.configService.get<boolean>('IMAP_ENABLED', false);
    this.useSubmitIngestion = this.configService.get<boolean>('NFE_IMAP_USE_SUBMIT_INGESTION', false);
  }

  async import(filterStart: Date, filterEnd: Date): Promise<InvoiceImport | null> {
    if (!this.enabled) {
      this.logger.debug('IMAP import disabled');
      return null;
    }

    this.logger.log('ExternalInvoicesImporterJob Iniciado (IMAP)');

    const invoiceImport = this.invoiceImportRepo.create({
      filterStart,
      filterEnd,
      source: ExternalInvoiceSource.IMAP,
      status: InvoiceImportStatus.PENDING,
      automatic: true,
    });
    const savedImport = await this.invoiceImportRepo.save(invoiceImport);

    try {
      const emails = await this.fetchUnseenEmails();
      this.logger.log(`Encontrados ${emails.length} emails nao lidos`);

      for (const email of emails) {
        try {
          await this.processEmail(email, savedImport.id);
        } catch (error) {
          this.logger.error(`Error processing email: ${(error as Error).message}`);
          await this.invoiceImportLogRepo.save(
            this.invoiceImportLogRepo.create({
              invoiceImportId: savedImport.id,
              status: InvoiceImportLogStatus.ERROR,
              log: { general: [`Error processing email: ${(error as Error).message}`] },
              metadata: email.metadata ?? {},
            }),
          );
        }
      }

      savedImport.status = InvoiceImportStatus.SUCCESS;
      await this.invoiceImportRepo.save(savedImport);
      this.logger.log('ExternalInvoicesImporterJob Finalizado (IMAP)');
    } catch (error) {
      savedImport.status = InvoiceImportStatus.ERROR;
      await this.invoiceImportRepo.save(savedImport);
      this.logger.error(`ExternalInvoicesImporterJob falhou (IMAP): ${(error as Error).message}`);
      throw error;
    }

    return savedImport;
  }

  private async fetchUnseenEmails(): Promise<ImapEmailPayload[]> {
    if (this.configService.get<boolean>('IMAP_MOCK_ENABLED', false)) {
      const mockPath = this.configService.get<string>('IMAP_MOCK_XML_PATH', '')?.trim();
      if (mockPath && fs.existsSync(mockPath)) {
        const xml = fs.readFileSync(mockPath, 'utf8');
        const accessKey = extractChaveAcessoFromXml(xml) ?? '00000000000000000000000000000000000000000000';
        return [{ xml, accessKey, from: 'mock@fixture', metadata: { mock: true } }];
      }
      this.logger.debug('IMAP mock enabled but no fixture file');
      return [];
    }

    const host = this.configService.get<string>('IMAP_HOST', '')?.trim();
    if (!host) {
      this.logger.warn('IMAP_HOST not configured — skipping fetch');
      return [];
    }

    const user = this.configService.get<string>('IMAP_USERNAME', '');
    const password = this.configService.get<string>('IMAP_PASSWORD', '');
    const port = this.configService.get<number>('IMAP_PORT', 993);
    const tls = this.configService.get<boolean>('IMAP_TLS', true);
    const maxAtt = this.configService.get<number>('IMAP_MAX_ATTACHMENTS_PER_MAIL', 10);
    const maxZip = this.configService.get<number>('IMAP_MAX_UNCOMPRESSED_ZIP_BYTES', 20 * 1024 * 1024);

    return new Promise((resolve, reject) => {
      const imap = new Imap({ user, password, host, port, tls, tlsOptions: { rejectUnauthorized: true } });
      const out: ImapEmailPayload[] = [];

      imap.once('error', (err: Error) => {
        this.logger.error(`IMAP connection error: ${err.message}`);
        reject(err);
      });

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (errOpen) => {
          if (errOpen) {
            imap.end();
            reject(errOpen);
            return;
          }
          imap.search(['UNSEEN'], (errSearch, results) => {
            if (errSearch) {
              imap.end();
              reject(errSearch);
              return;
            }
            if (!results?.length) {
              imap.end();
              resolve([]);
              return;
            }

            const fetch = imap.fetch(results, { bodies: '' });
            const messageJobs: Promise<void>[] = [];
            fetch.on('message', (msg) => {
              messageJobs.push(
                new Promise<void>((resolveMsg) => {
                  msg.on('body', (stream) => {
                    let buf = Buffer.alloc(0);
                    stream.on('data', (chunk: Buffer) => {
                      buf = Buffer.concat([buf, chunk]);
                    });
                    stream.once('end', async () => {
                      try {
                        const parsed = await simpleParser(buf);
                        const fromAddr = parsed.from?.value?.[0]?.address ?? 'unknown';
                        const meta: Record<string, unknown> = {
                          messageId: parsed.messageId,
                          subject: parsed.subject,
                        };
                        let count = 0;
                        for (const att of parsed.attachments ?? []) {
                          if (count >= maxAtt) break;
                          const fn = (att.filename ?? '').toLowerCase();
                          const ext = fn.includes('.') ? fn.slice(fn.lastIndexOf('.')) : '';
                          if (!ALLOWED_EXT.has(ext)) continue;
                          count++;
                          let xml: string | null = null;
                          if (ext === '.xml') {
                            xml = att.content.toString('utf8');
                          } else if (ext === '.zip') {
                            xml = this.extractXmlFromZip(att.content, maxZip);
                          }
                          if (!xml) continue;
                          const accessKey = extractChaveAcessoFromXml(xml);
                          if (!accessKey) continue;
                          out.push({
                            xml,
                            accessKey,
                            from: fromAddr,
                            metadata: { ...meta, filename: att.filename },
                          });
                        }
                      } catch (e) {
                        this.logger.warn(`mailparser error: ${(e as Error).message}`);
                      } finally {
                        resolveMsg();
                      }
                    });
                  });
                }),
              );
            });
            fetch.once('error', (fe) => {
              imap.end();
              reject(fe);
            });
            fetch.once('end', async () => {
              await Promise.all(messageJobs);
              imap.end();
              resolve(out);
            });
          });
        });
      });

      imap.connect();
    });
  }

  private extractXmlFromZip(buffer: Buffer, maxUncompressed: number): string | null {
    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      let total = 0;
      for (const e of entries) {
        total += e.header.size;
        if (total > maxUncompressed) {
          this.logger.warn('ZIP rejected: uncompressed size exceeds limit');
          return null;
        }
      }
      for (const e of entries) {
        if (e.isDirectory) continue;
        const name = e.entryName.toLowerCase();
        if (!name.endsWith('.xml')) continue;
        const data = e.getData();
        const s = data.toString('utf8');
        if (s.includes('<NFe') || s.includes('nfeProc')) {
          return s;
        }
      }
    } catch (e) {
      this.logger.warn(`ZIP parse failed: ${(e as Error).message}`);
    }
    return null;
  }

  private async processEmail(email: ImapEmailPayload, invoiceImportId: string): Promise<void> {
    const source = email.from === 'notificacao@grupoamicci.com.br'
      ? ExternalInvoiceSource.BUYER
      : ExternalInvoiceSource.IMAP;

    if (this.useSubmitIngestion) {
      const msgId = typeof email.metadata.messageId === 'string' ? email.metadata.messageId : 'no-msg-id';
      const fn = typeof email.metadata.filename === 'string' ? email.metadata.filename : 'file';
      await this.submitIngestionService.submit({
        xmlContent: email.xml,
        source: NfSource.IMAP,
        externalRef: `imap:${msgId}:${fn}:${email.accessKey}`,
      });
    }

    const result = await this.externalInvoiceCreator.create(
      email.accessKey,
      email.xml,
      source,
      invoiceImportId,
    );

    const status = result.created
      ? InvoiceImportLogStatus.SUCCESS
      : result.ignored
        ? InvoiceImportLogStatus.IGNORED
        : InvoiceImportLogStatus.ERROR;

    await this.invoiceImportLogRepo.save(
      this.invoiceImportLogRepo.create({
        invoiceImportId,
        status,
        log: {
          general: [result.created ? 'NF imported' : (result.error ?? 'Ignored')],
          attachments: [{ filename: `${email.accessKey}.xml`, status: result.created ? 'success' : 'ignored', access_key: email.accessKey }],
        },
        metadata: email.metadata,
      }),
    );
  }
}
