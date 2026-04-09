import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as libxmljs from 'libxmljs2';
import { NonRetryableException } from '../../common/exceptions/non-retryable.exception';

@Injectable()
export class NfeXsdValidationService implements OnModuleInit {
  private readonly logger = new Logger(NfeXsdValidationService.name);
  private xsdDocument: libxmljs.Document | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const basePath = this.configService.get<string>('NFE_XSD_BASE_PATH', '')?.trim();
    const mainFile = this.configService.get<string>('NFE_XSD_MAIN_FILE', 'leiauteNFe_v4.00.xsd')?.trim() || 'leiauteNFe_v4.00.xsd';
    if (!basePath) {
      this.logger.log('NFE_XSD_BASE_PATH not set — XSD validation skipped');
      return;
    }
    const mainPath = path.resolve(basePath, mainFile);
    if (!fs.existsSync(mainPath)) {
      this.logger.warn(`NF-e XSD main file not found at ${mainPath} — XSD validation skipped`);
      return;
    }
    try {
      const xsdText = fs.readFileSync(mainPath, 'utf8');
      this.xsdDocument = libxmljs.parseXml(xsdText, { baseUrl: path.dirname(mainPath) + path.sep });
      this.logger.log(`NF-e XSD loaded from ${mainPath}`);
    } catch (e) {
      this.logger.error(`Failed to parse XSD at ${mainPath}: ${(e as Error).message}`);
    }
  }

  validateOrSkip(xmlContent: string): void {
    if (!this.xsdDocument) {
      return;
    }
    let xmlDoc: libxmljs.Document;
    try {
      xmlDoc = libxmljs.parseXml(xmlContent, { noent: false, nonet: true, noblanks: true });
    } catch (e) {
      throw new NonRetryableException(
        `XML parse error before XSD validation: ${(e as Error).message}`,
        'NF001',
        {},
      );
    }
    const ok = xmlDoc.validate(this.xsdDocument);
    if (!ok) {
      const errText = xmlDoc.validationErrors.map((x) => x.message).join('; ') || 'XSD validation failed';
      throw new NonRetryableException(errText, 'NF002', {});
    }
  }
}
