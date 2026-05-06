import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceItem } from '@context/invoice/domain/entities/invoice-item.entity';
import { ensureArray, safeGetString, safeGetNumber } from '@shared/utils/xml-parser.util';

const ICMS_TYPES = ['ICMS10', 'ICMS70', 'ICMS40'] as const;

@Injectable()
export class InvoiceItemCreatorService {
  private readonly logger = new Logger(InvoiceItemCreatorService.name);

  constructor(
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
  ) {}

  async createItems(invoiceId: string, infNfe: Record<string, unknown>, isDevolucao: boolean): Promise<InvoiceItem[]> {
    const detArray = ensureArray(infNfe['det'] as Record<string, unknown>);
    const items: InvoiceItem[] = [];

    for (const rawDet of detArray) {
      const det = rawDet as Record<string, unknown>;
      const prod = (det['prod'] ?? {}) as Record<string, unknown>;
      const imposto = (det['imposto'] ?? {}) as Record<string, unknown>;

      const netValue = this.roundTwo(safeGetNumber(prod, 'vProd'));
      const descValue = safeGetNumber(prod, 'vDesc');
      const ipiValue = this.extractIpiValue(imposto);

      const { icmsstValue, icmsdesonValue, fcpstValue, bcIcmsValue, aliqIcmsValue, icmsValue } =
        this.extractIcmsValues(imposto);

      let grossValue = netValue + ipiValue - descValue;
      if (icmsstValue > 0) grossValue += icmsstValue;
      if (fcpstValue > 0) grossValue += fcpstValue;
      if (icmsdesonValue > 0) grossValue -= icmsdesonValue;
      grossValue = this.roundTwo(grossValue);

      const finalNetValue = isDevolucao ? -Math.abs(netValue) : netValue;
      const finalGrossValue = isDevolucao ? -Math.abs(grossValue) : grossValue;

      const item = this.invoiceItemRepo.create({
        invoiceId,
        productName: safeGetString(prod, 'xProd'),
        ean: safeGetString(prod, 'cEAN'),
        productCode: safeGetString(prod, 'cProd'),
        unitMeasure: safeGetString(prod, 'uCom'),
        netValue: finalNetValue,
        grossValue: finalGrossValue,
        qtdeItem: safeGetNumber(prod, 'qCom'),
        unitValue: this.roundTwo(safeGetNumber(prod, 'vUnCom')),
        descValue,
        ipiValue,
        icmsstValue,
        icmsdesonValue,
        fcpstValue,
        bcIcmsValue,
        aliqIcmsValue,
        icmsValue,
        skuId: null,
      });

      items.push(item);
    }

    if (items.length > 0) {
      return this.invoiceItemRepo.save(items);
    }
    return items;
  }

  private extractIpiValue(imposto: Record<string, unknown>): number {
    const ipi = (imposto['IPI'] ?? {}) as Record<string, unknown>;
    const ipiTrib = (ipi['IPITrib'] ?? {}) as Record<string, unknown>;
    return safeGetNumber(ipiTrib, 'vIPI');
  }

  private extractIcmsValues(imposto: Record<string, unknown>): {
    icmsstValue: number;
    icmsdesonValue: number;
    fcpstValue: number;
    bcIcmsValue: number;
    aliqIcmsValue: number;
    icmsValue: number;
  } {
    const icmsGroup = (imposto['ICMS'] ?? {}) as Record<string, unknown>;

    let icmsstValue = 0;
    let icmsdesonValue = 0;
    let fcpstValue = 0;
    let bcIcmsValue = 0;
    let aliqIcmsValue = 0;
    let icmsValue = 0;

    for (const icmsType of ICMS_TYPES) {
      const icms = icmsGroup[icmsType] as Record<string, unknown> | undefined;
      if (!icms) continue;

      const vICMSST = safeGetNumber(icms, 'vICMSST');
      if (vICMSST > 0 && icmsstValue === 0) icmsstValue = vICMSST;

      const vICMSDeson = safeGetNumber(icms, 'vICMSDeson');
      if (vICMSDeson > 0 && icmsdesonValue === 0) icmsdesonValue = vICMSDeson;

      const vFCPST = safeGetNumber(icms, 'vFCPST');
      if (vFCPST > 0 && fcpstValue === 0) fcpstValue = vFCPST;

      const vBC = safeGetNumber(icms, 'vBC');
      if (vBC > 0 && bcIcmsValue === 0) bcIcmsValue = vBC;

      const pICMS = safeGetNumber(icms, 'pICMS');
      if (pICMS > 0 && aliqIcmsValue === 0) aliqIcmsValue = pICMS;

      const vICMS = safeGetNumber(icms, 'vICMS');
      if (vICMS > 0 && icmsValue === 0) icmsValue = vICMS;
    }

    return { icmsstValue, icmsdesonValue, fcpstValue, bcIcmsValue, aliqIcmsValue, icmsValue };
  }

  private roundTwo(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
