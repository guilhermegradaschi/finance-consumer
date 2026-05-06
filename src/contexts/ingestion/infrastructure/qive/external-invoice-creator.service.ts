import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalInvoice } from '@context/invoice/domain/entities/external-invoice.entity';
import { ExternalInvoiceStatus } from '@context/invoice/domain/enums/external-invoice-status.enum';
import { ExternalInvoiceSource } from '@context/invoice/domain/enums/external-invoice-source.enum';
import { ExternalInvoiceOperation } from '@context/invoice/domain/enums/external-invoice-operation.enum';
import { S3Service } from '@infra/s3/s3.service';
import { parseXmlToHash, extractInfNfe, safeGetString, ensureArray } from '@shared/utils/xml-parser.util';
import {
  cfopToOperation,
  isDevolucaoAssignDefault,
  isDevolucao,
} from '@context/invoice/domain/constants/invoices-code-operations';

export interface ExternalInvoiceCreateResult {
  created: boolean;
  ignored?: boolean;
  error?: string;
  externalInvoice?: ExternalInvoice;
}

@Injectable()
export class ExternalInvoiceCreatorService {
  private readonly logger = new Logger(ExternalInvoiceCreatorService.name);

  constructor(
    @InjectRepository(ExternalInvoice)
    private readonly externalInvoiceRepo: Repository<ExternalInvoice>,
    private readonly s3Service: S3Service,
  ) {}

  async create(
    accessKey: string,
    xml: string,
    source: ExternalInvoiceSource,
    invoiceImportId?: string,
  ): Promise<ExternalInvoiceCreateResult> {
    const existing = await this.externalInvoiceRepo.findOne({ where: { accessKey } });
    if (existing) {
      this.logger.warn(`Duplicate access_key: ${accessKey}`);
      return { created: false, ignored: true };
    }

    let hash: Record<string, unknown>;
    try {
      hash = parseXmlToHash(xml);
    } catch (error) {
      this.logger.error(`Failed to parse XML for ${accessKey}: ${(error as Error).message}`);
      return { created: false, error: `XML parse error: ${(error as Error).message}` };
    }

    const infNfe = extractInfNfe(hash);
    if (!infNfe) {
      this.logger.error(`infNFe not found in XML for ${accessKey}`);
      return { created: false, error: 'infNFe not found in XML' };
    }

    const dest = infNfe['dest'] as Record<string, unknown> | undefined;
    if (!dest) {
      this.logger.error(`dest not found in XML for ${accessKey} - CNPJ do varejista nao pode ser encontrado`);
      return { created: false, error: 'CNPJ do varejista nao pode ser encontrado' };
    }

    const filename = await this.s3Service.uploadExternalInvoiceXml(accessKey, xml);

    const ide = (infNfe['ide'] ?? {}) as Record<string, unknown>;
    const total = (infNfe['total'] ?? {}) as Record<string, unknown>;
    const icmsTot = (total['ICMSTot'] ?? {}) as Record<string, unknown>;
    const emit = (infNfe['emit'] ?? {}) as Record<string, unknown>;
    const compra = infNfe['compra'];

    const det = ensureArray(infNfe['det'] as Record<string, unknown> | Record<string, unknown>[]);
    const firstDet = det[0] as Record<string, unknown> | undefined;
    const firstProd = firstDet
      ? ((firstDet['prod'] ?? {}) as Record<string, unknown>)
      : ({} as Record<string, unknown>);
    const cfop = String(firstProd['CFOP'] ?? '');

    const operation = cfopToOperation(cfop);
    const devolution = isDevolucao(operation);
    const assignDefault = cfop ? isDevolucaoAssignDefault(cfop) : true;

    let buyerCnpj: string;
    let sellerCnpj: string;
    let buyerName: string | null;

    if (!devolution || assignDefault) {
      buyerCnpj = safeGetString(dest, 'CNPJ') ?? '';
      sellerCnpj = safeGetString(emit, 'CNPJ') ?? '';
      buyerName = safeGetString(dest, 'xNome');
    } else {
      buyerCnpj = safeGetString(emit, 'CNPJ') ?? '';
      sellerCnpj = safeGetString(dest, 'CNPJ') ?? '';
      buyerName = safeGetString(emit, 'xNome');
    }

    const orderNumber =
      compra && typeof compra === 'object' ? safeGetString(compra as Record<string, unknown>, 'xPed') : null;

    const entity = this.externalInvoiceRepo.create({
      accessKey,
      invoiceNumber: String(ide['nNF'] ?? ''),
      date: new Date(String(ide['dhEmi'] ?? new Date().toISOString())),
      value: parseFloat(String(icmsTot['vNF'] ?? '0')),
      deliveryDate: ide['dhSaiEnt'] ? new Date(String(ide['dhSaiEnt'])) : null,
      orderNumber,
      buyerCnpj,
      sellerCnpj,
      buyerName,
      codeOperation: cfop || null,
      operation,
      source,
      status: ExternalInvoiceStatus.PENDING,
      filename,
      invoiceImportId: invoiceImportId ?? null,
    });

    const saved = await this.externalInvoiceRepo.save(entity);
    this.logger.log(`Created ExternalInvoice ${saved.id} for access_key ${accessKey}`);

    return { created: true, externalInvoice: saved };
  }
}
