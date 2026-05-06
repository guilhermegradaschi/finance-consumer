import { Injectable } from '@nestjs/common';
import { safeGetString, safeGetNumber, safeGet } from '@shared/utils/xml-parser.util';
import {
  cfopToOperation,
  isDevolucaoAssignDefault,
  isDevolucao,
} from '@context/invoice/domain/constants/invoices-code-operations';
import { ExternalInvoiceOperation } from '@context/invoice/domain/enums/external-invoice-operation.enum';

export interface InvoiceAttributes {
  invoiceNumber: string;
  date: Date;
  value: number;
  deliveryDate: Date | null;
  orderNumber: string | null;
  observations: string | null;
  ufRecipient: string | null;
  ufSender: string | null;
  accessKey: string;
  icmsdesonDiscountValue: number;
  codeOperation: string | null;
  operation: string;
  buyerCnpj: string;
  sellerCnpj: string;
}

@Injectable()
export class InvoiceExtractAttributesService {
  extract(infNfe: Record<string, unknown>, accessKey: string): InvoiceAttributes {
    const ide = (infNfe['ide'] ?? {}) as Record<string, unknown>;
    const total = (infNfe['total'] ?? {}) as Record<string, unknown>;
    const icmsTot = (total['ICMSTot'] ?? {}) as Record<string, unknown>;
    const emit = (infNfe['emit'] ?? {}) as Record<string, unknown>;
    const dest = (infNfe['dest'] ?? {}) as Record<string, unknown>;
    const infAdic = (infNfe['infAdic'] ?? {}) as Record<string, unknown>;
    const compra = infNfe['compra'];

    const det = Array.isArray(infNfe['det']) ? infNfe['det'] : infNfe['det'] ? [infNfe['det']] : [];
    const firstDet = (det[0] ?? {}) as Record<string, unknown>;
    const firstProd = (firstDet['prod'] ?? {}) as Record<string, unknown>;
    const cfop = String(firstProd['CFOP'] ?? '');

    const operation = cfopToOperation(cfop);
    const devolution = isDevolucao(operation);
    const assignDefault = cfop ? isDevolucaoAssignDefault(cfop) : true;

    let buyerCnpj: string;
    let sellerCnpj: string;

    if (!devolution || assignDefault) {
      buyerCnpj = safeGetString(dest, 'CNPJ') ?? '';
      sellerCnpj = safeGetString(emit, 'CNPJ') ?? '';
    } else {
      buyerCnpj = safeGetString(emit, 'CNPJ') ?? '';
      sellerCnpj = safeGetString(dest, 'CNPJ') ?? '';
    }

    const infCpl = safeGetString(infAdic, 'infCpl');
    const infAdFisco = safeGetString(infAdic, 'infAdFisco');
    const observations = [infCpl, infAdFisco].filter(Boolean).join(' | ') || null;

    const orderNumber =
      compra && typeof compra === 'object' ? safeGetString(compra as Record<string, unknown>, 'xPed') : null;

    const dateStr = String(ide['dhEmi'] ?? '');
    const date = dateStr ? new Date(dateStr.substring(0, 10)) : new Date();

    const deliveryDateStr = safeGetString(ide, 'dhSaiEnt');
    const deliveryDate = deliveryDateStr ? new Date(deliveryDateStr) : null;

    let resolvedAccessKey = accessKey;
    if (!resolvedAccessKey) {
      const idAttr = safeGetString(infNfe, '@Id');
      resolvedAccessKey = idAttr ? idAttr.replace(/^NFe/, '') : '';
    }

    return {
      invoiceNumber: String(ide['nNF'] ?? ''),
      date,
      value: safeGetNumber(icmsTot, 'vNF'),
      deliveryDate,
      orderNumber,
      observations,
      ufRecipient: safeGetString(dest, 'enderDest.UF'),
      ufSender: safeGetString(emit, 'enderEmit.UF'),
      accessKey: resolvedAccessKey,
      icmsdesonDiscountValue: safeGetNumber(icmsTot, 'vICMSDeson'),
      codeOperation: cfop || null,
      operation: operation === ExternalInvoiceOperation.DEVOLUCAO ? 'devolucao' : 'venda',
      buyerCnpj,
      sellerCnpj,
    };
  }
}
