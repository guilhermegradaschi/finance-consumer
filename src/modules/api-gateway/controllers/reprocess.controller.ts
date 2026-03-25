import { Controller, Post, Param, UseGuards, NotFoundException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NotaFiscalRepository } from '../../persistence/repositories/nota-fiscal.repository';
import { S3Service } from '../../../infrastructure/s3/s3.service';
import { NfReceiverService } from '../../nf-receiver/nf-receiver.service';
import { IdempotencyService } from '../../../infrastructure/redis/idempotency.service';

@ApiTags('Reprocessamento')
@Controller('api/v1/nf/reprocess')
export class ReprocessController {
  private readonly logger = new Logger(ReprocessController.name);

  constructor(
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly s3Service: S3Service,
    private readonly nfReceiverService: NfReceiverService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post(':chaveAcesso')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reprocess a NF-e by chave de acesso' })
  async reprocess(@Param('chaveAcesso') chaveAcesso: string) {
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

    return this.nfReceiverService.receive({ xmlContent, source: nf.source });
  }
}
