import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NfSource } from '../../../common/enums/nf-source.enum';
import { SubmitIngestionService } from '../../nf-receiver/submit-ingestion.service';
import { SubmitNfMultipartFieldsDto } from '../dto/submit-nf-multipart.dto';
import { IngestNfeProviderDto } from '../dto/ingest-nfe-provider.dto';
import { IngestNfeEventDto } from '../dto/ingest-nfe-event.dto';
import { NfeEventIngestService } from '../../invoice-events/nfe-event-ingest.service';

const MAX_NF_XML_BYTES = 10 * 1024 * 1024;

type UploadedXmlFile = { buffer: Buffer; originalname?: string; mimetype?: string };

function decodeOptionalBase64(raw: string | undefined): string | undefined {
  if (raw == null || raw === '') return undefined;
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw new BadRequestException('xml_base64 is not valid base64');
  }
}

function normalizeMultipartMetadataJson(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !s.startsWith('{')) return undefined;
  return s;
}

@ApiTags('Ingestão NFe')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('ingest/nfe')
export class IngestNfeController {
  constructor(
    private readonly submitIngestionService: SubmitIngestionService,
    private readonly nfeEventIngestService: NfeEventIngestService,
  ) {}

  @Post('provider')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ingestão NFe (provider) — JSON com XML ou base64' })
  @ApiResponse({ status: 202, description: 'Aceito para processamento' })
  async provider(
    @Body() body: IngestNfeProviderDto,
    @Headers('x-correlation-id') correlationHeader?: string,
  ) {
    let xmlContent = body.xmlContent?.trim() ?? '';
    const fromB64 = decodeOptionalBase64(body.xml_base64);
    if (fromB64) {
      if (xmlContent) {
        throw new BadRequestException('Informe apenas xmlContent ou xml_base64, não ambos');
      }
      xmlContent = fromB64.trim();
    }
    if (!xmlContent) {
      throw new BadRequestException('xmlContent ou xml_base64 é obrigatório');
    }
    return this.submitIngestionService.submit({
      xmlContent,
      source: body.source ?? NfSource.API,
      metadata: body.metadata,
      correlationId: body.correlation_id ?? correlationHeader,
      externalRef: body.external_ref,
    });
  }

  @Post('provider/upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_NF_XML_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ingestão NFe (provider) — upload multipart' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        source: { type: 'string', enum: Object.values(NfSource) },
        metadataJson: { type: 'string' },
        external_ref: { type: 'string' },
      },
    },
  })
  async providerUpload(
    @UploadedFile() file: UploadedXmlFile | undefined,
    @Body() fields: SubmitNfMultipartFieldsDto & { external_ref?: string },
    @Headers('x-correlation-id') correlationHeader?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo XML é obrigatório (campo file)');
    }
    const xmlContent = file.buffer.toString('utf8').trim();
    if (!xmlContent) {
      throw new BadRequestException('Arquivo XML vazio');
    }
    let metadata: Record<string, unknown> | undefined;
    const rawMeta = normalizeMultipartMetadataJson(fields.metadataJson);
    if (rawMeta) {
      try {
        const parsed: unknown = JSON.parse(rawMeta);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new BadRequestException('metadataJson deve ser um objeto JSON');
        }
        metadata = parsed as Record<string, unknown>;
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException('metadataJson deve ser JSON válido');
      }
    }
    return this.submitIngestionService.submit({
      xmlContent,
      source: fields.source ?? NfSource.API,
      metadata,
      correlationId: correlationHeader,
      externalRef: fields.external_ref,
    });
  }

  @Post('complete')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stub — confirmação pós presigned URL (não implementado)' })
  async completeStub() {
    throw new BadRequestException('POST /ingest/nfe/complete ainda não implementado');
  }

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ingestão de evento NFe (cancelamento, CC-e, etc.)' })
  async events(@Body() body: IngestNfeEventDto, @Headers('x-correlation-id') correlationHeader?: string) {
    return this.nfeEventIngestService.ingest({
      xmlContent: body.xmlContent,
      xml_base64: body.xml_base64,
      event_type: body.event_type,
      correlation_id: body.correlation_id ?? correlationHeader,
    });
  }
}
