import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceItem } from '@context/invoice/domain/entities/invoice-item.entity';

@Injectable()
export class InvoiceSkuAssociationService {
  private readonly logger = new Logger(InvoiceSkuAssociationService.name);

  constructor(
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
  ) {}

  /**
   * Associates SKUs to invoice items using the following fallback chain:
   * 1. Direct match by ean/dun/edi_code
   * 2. Fallback by product_code (last 12 months)
   * 3. AI identification (SkuAiIdentificationService)
   *
   * Full implementation requires access to SKU/product tables and AI service.
   */
  async associate(invoiceId: string, _buyerId: number): Promise<void> {
    const items = await this.invoiceItemRepo.find({ where: { invoiceId } });

    for (const item of items) {
      const skuId = await this.findSkuByEan(item.ean);
      if (skuId) {
        item.skuId = skuId;
        await this.invoiceItemRepo.save(item);
        this.logger.log(`Associated invoice item #${item.id} with SKU #${skuId}`);
      }
    }

    // TODO: Implement fallback by product_code and AI identification
  }

  private async findSkuByEan(_ean: string | null): Promise<number | null> {
    // TODO: Query SKU table by ean/dun/edi_code
    return null;
  }
}
