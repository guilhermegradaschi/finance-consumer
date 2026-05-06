import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotaFiscalRepository } from '@context/nfe-legacy/domain/repositories/nota-fiscal.repository';
import { S3Service } from '@infra/s3/s3.service';
import { SubmitIngestionService } from '@context/ingestion/application/services/submit-ingestion.service';
import { IdempotencyService } from '@infra/redis/idempotency.service';
import { NfSource } from '@shared/enums/nf-source.enum';

@Injectable()
export class NfReprocessService {
  private readonly logger = new Logger(NfReprocessService.name);

  constructor(
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly s3Service: S3Service,
    private readonly submitIngestionService: SubmitIngestionService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async reprocessByAccessKey(chaveAcesso: string): Promise<unknown> {
    const nf = await this.notaFiscalRepository.findByChaveAcesso(chaveAcesso);
    if (!nf) {
      throw new NotFoundException(`NF-e ${chaveAcesso} not found`);
    }

    if (!nf.xmlS3Key) {
      throw new NotFoundException(`XML not found for NF-e ${chaveAcesso}`);
    }

    await this.idempotencyService.remove(nf.idempotencyKey);

    const xmlContent = await this.s3Service.download(nf.xmlS3Key);

    this.logger.log(`Reprocessing NF-e: ${chaveAcesso}`);

    return this.submitIngestionService.submit({
      xmlContent,
      source: (nf.source as NfSource) ?? NfSource.API,
      externalRef: `reprocess:${chaveAcesso}`,
      replaceExistingIngestion: true,
    });
  }
}
