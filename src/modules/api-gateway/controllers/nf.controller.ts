import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { NfReceiverService } from '../../nf-receiver/nf-receiver.service';
import { NotaFiscalRepository } from '../../persistence/repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from '../../persistence/repositories/nf-processing-log.repository';
import { GetNfTimelineUseCase } from '../../../application/use-cases/get-nf-timeline.use-case';
import { AuditLogService } from '../../../application/audit-log.service';
import { SubmitNfMultipartFieldsDto } from '../dto/submit-nf-multipart.dto';
import { QueryNfDto } from '../dto/query-nf.dto';
import { QueryNfAuditDto } from '../dto/query-nf-audit.dto';
import { QueryNfAuditEventsDto } from '../dto/query-nf-audit-events.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NfSource } from '../../../common/enums/nf-source.enum';

const MAX_NF_XML_BYTES = 10 * 1024 * 1024;

type UploadedXmlFile = { buffer: Buffer; originalname?: string; mimetype?: string };

function normalizeMultipartMetadataJson(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !s.startsWith('{')) {
    return undefined;
  }
  return s;
}

@ApiTags('Notas Fiscais')
@Controller('api/v1/nf')
export class NfController {
  constructor(
    private readonly nfReceiverService: NfReceiverService,
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly processingLogRepository: NfProcessingLogRepository,
    private readonly getNfTimelineUseCase: GetNfTimelineUseCase,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_NF_XML_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a new NF-e for processing (XML file upload)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'NF-e XML file (.xml)' },
        source: { type: 'string', enum: Object.values(NfSource), description: 'Optional (default API)' },
        metadataJson: { type: 'string', description: 'Optional JSON object string (leave empty if not needed)' },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'NF-e accepted for processing' })
  @ApiResponse({ status: 400, description: 'Missing or empty file' })
  @ApiResponse({ status: 409, description: 'Duplicate NF-e' })
  async submit(
    @UploadedFile() file: UploadedXmlFile | undefined,
    @Body() fields: SubmitNfMultipartFieldsDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('XML file is required (form field name: file)');
    }
    const xmlContent = file.buffer.toString('utf8').trim();
    if (!xmlContent) {
      throw new BadRequestException('XML file is empty');
    }
    let metadata: Record<string, unknown> | undefined;
    const rawMeta = normalizeMultipartMetadataJson(fields.metadataJson);
    if (rawMeta) {
      try {
        const parsed: unknown = JSON.parse(rawMeta);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new BadRequestException('metadataJson must be a JSON object');
        }
        metadata = parsed as Record<string, unknown>;
      } catch (e) {
        if (e instanceof BadRequestException) {
          throw e;
        }
        throw new BadRequestException('metadataJson must be valid JSON');
      }
    }
    return this.nfReceiverService.receive({
      xmlContent,
      source: fields.source ?? NfSource.API,
      metadata,
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

  @Get('audit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Enriched audit summary grouped by chave de acesso',
    description:
      'Returns one row per chave_acesso with aggregated signals: whether a successful RECEIVE ever occurred, ' +
      'the outcome of the most recent RECEIVE (SUCCESS / DUPLICATE / REJECTED), the latest pipeline event, ' +
      'and nota_fiscal status when the NF was persisted. ' +
      'Filters apply with "any-match" semantics: a chave is included if ANY of its processing logs match the filter. ' +
      'DUPLICATE appears when the same XML is re-sent after a successful first receive (idempotency). ' +
      'Use GET /audit/events for a flat, per-event drill-down.',
  })
  @ApiResponse({ status: 200, description: 'Paginated enriched audit summary' })
  async audit(@Query() query: QueryNfAuditDto) {
    const result = await this.processingLogRepository.findFailedNfs({
      stage: query.stage,
      status: query.status,
      source: query.source as NfSource | undefined,
      page: query.page,
      limit: query.limit,
    });

    this.auditLogService.log({
      action: 'nf.audit',
      metadata: { filters: query, resultCount: result.total },
    });

    return {
      data: result.data,
      total: result.total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      totalPages: Math.ceil(result.total / (query.limit ?? 20)),
    };
  }

  @Get('audit/events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List individual processing log events for auditing',
    description:
      'Returns every nf_processing_log row (flat list, not grouped by chave). ' +
      'Useful for drill-down after the /audit summary or for complete timeline across all NFs. ' +
      'DUPLICATE events appear when the same XML is re-sent (idempotency); ' +
      'REJECTED events indicate XML-level validation failures.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of processing log events' })
  async auditEvents(@Query() query: QueryNfAuditEventsDto) {
    const result = await this.processingLogRepository.findAuditEvents({
      stage: query.stage,
      status: query.status,
      source: query.source as NfSource | undefined,
      chaveAcesso: query.chaveAcesso,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      limit: query.limit,
    });

    this.auditLogService.log({
      action: 'nf.audit.events',
      metadata: { filters: query, resultCount: result.total },
    });

    return {
      data: result.data,
      total: result.total,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      totalPages: Math.ceil(result.total / (query.limit ?? 50)),
    };
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

  @Get(':chaveAcesso/timeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get full processing timeline for a NF-e across all pipelines' })
  @ApiResponse({ status: 200, description: 'Complete NF-e processing timeline' })
  @ApiResponse({ status: 404, description: 'No records found for this chave de acesso' })
  async getTimeline(@Param('chaveAcesso') chaveAcesso: string) {
    const timeline = await this.getNfTimelineUseCase.execute(chaveAcesso);
    if (!timeline) {
      throw new NotFoundException(`No records found for chave ${chaveAcesso}`);
    }
    return timeline;
  }
}
