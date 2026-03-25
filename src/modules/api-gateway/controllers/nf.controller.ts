import { Controller, Post, Get, Param, Query, Body, HttpCode, HttpStatus, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NfReceiverService } from '../../nf-receiver/nf-receiver.service';
import { NotaFiscalRepository } from '../../persistence/repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from '../../persistence/repositories/nf-processing-log.repository';
import { SubmitNfDto } from '../dto/submit-nf.dto';
import { QueryNfDto } from '../dto/query-nf.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('Notas Fiscais')
@Controller('api/v1/nf')
export class NfController {
  constructor(
    private readonly nfReceiverService: NfReceiverService,
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly processingLogRepository: NfProcessingLogRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a new NF-e for processing' })
  @ApiResponse({ status: 202, description: 'NF-e accepted for processing' })
  @ApiResponse({ status: 409, description: 'Duplicate NF-e' })
  async submit(@Body() dto: SubmitNfDto) {
    return this.nfReceiverService.receive({
      xmlContent: dto.xmlContent,
      source: dto.source,
      metadata: dto.metadata,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List NF-e with filters and pagination' })
  async list(@Query() query: QueryNfDto) {
    const result = await this.notaFiscalRepository.findWithFilters({
      status: query.status,
      source: query.source,
      cnpjEmitente: query.cnpjEmitente,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.data,
      total: result.total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      totalPages: Math.ceil(result.total / (query.limit ?? 20)),
    };
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get status summary of all NF-e' })
  async summary() {
    return this.notaFiscalRepository.getStatusSummary();
  }

  @Get(':chaveAcesso')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get NF-e details by chave de acesso' })
  @ApiResponse({ status: 200, description: 'NF-e details' })
  @ApiResponse({ status: 404, description: 'NF-e not found' })
  async findByChaveAcesso(@Param('chaveAcesso') chaveAcesso: string) {
    const nf = await this.notaFiscalRepository.findByChaveAcesso(chaveAcesso);
    if (!nf) {
      throw new NotFoundException(`NF-e with chave ${chaveAcesso} not found`);
    }
    return nf;
  }

  @Get(':chaveAcesso/logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get processing logs for a NF-e' })
  async getLogs(@Param('chaveAcesso') chaveAcesso: string) {
    return this.processingLogRepository.getLogsByChaveAcesso(chaveAcesso);
  }
}
