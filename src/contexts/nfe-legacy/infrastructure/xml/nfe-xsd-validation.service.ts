import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { Document } from 'libxmljs2';
import { NonRetryableException } from '@shared/exceptions/non-retryable.exception';
import { tryLoadLibxmljs2 } from '@context/nfe-legacy/infrastructure/xml/libxmljs2-loader';

@Injectable()
export class NfeXsdValidationService implements OnModuleInit {
  private readonly logger = new Logger(NfeXsdValidationService.name);
  private libxml: ReturnType<typeof tryLoadLibxmljs2> = null;
  private xsdDocument: Document | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const basePath = this.configService.get<string>('NFE_XSD_BASE_PATH', '')?.trim();
    const mainFile =
      this.configService.get<string>('NFE_XSD_MAIN_FILE', 'leiauteNFe_v4.00.xsd')?.trim() || 'leiauteNFe_v4.00.xsd';

    if (!basePath) {
      this.logger.log('NFE_XSD_BASE_PATH not set — XSD validation skipped');
      return;
    }

    this.libxml = tryLoadLibxmljs2();
    if (!this.libxml) {
      this.logger.warn(
        'libxmljs2 not installed or failed to load — XSD validation disabled (optional: pnpm add libxmljs2 on a supported platform)',
      );
      return;
    }
    const mainPath = path.resolve(basePath, mainFile);
    if (!fs.existsSync(mainPath)) {
      this.logger.warn(`NF-e XSD main file not found at ${mainPath} — XSD validation skipped`);
      return;
    }
    try {
      const xsdText = fs.readFileSync(mainPath, 'utf8');
      this.xsdDocument = this.libxml.parseXml(xsdText, { baseUrl: path.dirname(mainPath) + path.sep });
      this.logger.log(`NF-e XSD loaded from ${mainPath}`);
    } catch (e) {
      this.logger.error(`Failed to parse XSD at ${mainPath}: ${(e as Error).message}`);
    }
  }

  validateOrSkip(xmlContent: string): void {
    const libxml = this.libxml;
    if (!libxml || !this.xsdDocument) {
      return;
    }
    let xmlDoc: Document;
    try {
      xmlDoc = libxml.parseXml(xmlContent, { noent: false, nonet: true, noblanks: true });
    } catch (e) {
      throw new NonRetryableException(`XML parse error before XSD validation: ${(e as Error).message}`, 'NF001', {});
    }
    const ok = xmlDoc.validate(this.xsdDocument);
    if (!ok) {
      const errText =
        xmlDoc.validationErrors.map((x: { message: string }) => x.message).join('; ') || 'XSD validation failed';
      throw new NonRetryableException(errText, 'NF002', {});
    }
  }
}
