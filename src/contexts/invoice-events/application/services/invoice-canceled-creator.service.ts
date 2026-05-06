import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '@context/invoice/domain/entities/invoice.entity';
import { InvoiceItem } from '@context/invoice/domain/entities/invoice-item.entity';
import { InvoiceStatus } from '@context/invoice/domain/enums/invoice-status.enum';

@Injectable()
export class InvoiceCanceledCreatorService {
  private readonly logger = new Logger(InvoiceCanceledCreatorService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
  ) {}

  async create(originalInvoice: Invoice): Promise<Invoice> {
    originalInvoice.status = InvoiceStatus.CANCELED;
    await this.invoiceRepo.save(originalInvoice);

    const originalItems = await this.invoiceItemRepo.find({
      where: { invoiceId: originalInvoice.id },
    });

    const canceledInvoice = this.invoiceRepo.create({
      invoiceNumber: originalInvoice.invoiceNumber,
      date: originalInvoice.date,
      value: -Math.abs(originalInvoice.value),
      accessKey: `${originalInvoice.accessKey}-cancel`,
      buyerId: originalInvoice.buyerId,
      sellerId: originalInvoice.sellerId,
      referenceDate: originalInvoice.referenceDate,
      ufRecipient: originalInvoice.ufRecipient,
      ufSender: originalInvoice.ufSender,
      observations: originalInvoice.observations,
      status: InvoiceStatus.PROCESSED,
      source: originalInvoice.source,
      ignoredReason: originalInvoice.ignoredReason,
      operation: 'cancelamento',
      codeOperation: originalInvoice.codeOperation,
      icmsdesonDiscountValue: -Math.abs(originalInvoice.icmsdesonDiscountValue),
      mpNetValue: -Math.abs(originalInvoice.mpNetValue),
      mpGrossValue: -Math.abs(originalInvoice.mpGrossValue),
      deliveryDate: originalInvoice.deliveryDate,
      orderNumber: originalInvoice.orderNumber,
      buyerCnpj: originalInvoice.buyerCnpj,
      sellerCnpj: originalInvoice.sellerCnpj,
      externalInvoiceId: originalInvoice.externalInvoiceId,
    });

    const savedCanceled = await this.invoiceRepo.save(canceledInvoice);

    const canceledItems = originalItems.map((item) =>
      this.invoiceItemRepo.create({
        invoiceId: savedCanceled.id,
        productName: item.productName,
        ean: item.ean,
        productCode: item.productCode,
        unitMeasure: item.unitMeasure,
        netValue: -Math.abs(item.netValue),
        grossValue: -Math.abs(item.grossValue),
        qtdeItem: item.qtdeItem,
        unitValue: -Math.abs(item.unitValue),
        descValue: -Math.abs(item.descValue),
        ipiValue: -Math.abs(item.ipiValue),
        icmsstValue: -Math.abs(item.icmsstValue),
        icmsdesonValue: -Math.abs(item.icmsdesonValue),
        fcpstValue: item.fcpstValue,
        bcIcmsValue: item.bcIcmsValue,
        aliqIcmsValue: item.aliqIcmsValue,
        icmsValue: item.icmsValue,
        skuId: item.skuId,
      }),
    );

    if (canceledItems.length > 0) {
      await this.invoiceItemRepo.save(canceledItems);
    }

    this.logger.log(
      `Cancellation created: original=${originalInvoice.id} canceled=${savedCanceled.id} items=${canceledItems.length}`,
    );

    return savedCanceled;
  }
}
