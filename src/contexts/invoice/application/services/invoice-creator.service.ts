import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '@context/invoice/domain/entities/invoice.entity';
import { ExternalInvoice } from '@context/invoice/domain/entities/external-invoice.entity';
import { InvoiceStatus } from '@context/invoice/domain/enums/invoice-status.enum';
import { InvoiceSource } from '@context/invoice/domain/enums/invoice-source.enum';
import { InvoiceIgnoredReason } from '@context/invoice/domain/enums/invoice-ignored-reason.enum';
import { ExternalInvoiceStatus } from '@context/invoice/domain/enums/external-invoice-status.enum';
import { ExternalInvoiceSource } from '@context/invoice/domain/enums/external-invoice-source.enum';
import { S3Service } from '@infra/s3/s3.service';
import { parseXmlToHash, extractInfNfe } from '@shared/utils/xml-parser.util';
import { InvoiceExtractAttributesService } from '@context/invoice/application/services/invoice-extract-attributes.service';
import { InvoiceItemCreatorService } from '@context/invoice/application/services/invoice-item-creator.service';
import { InvoiceVerifyDuplicationService } from '@context/invoice/application/services/invoice-verify-duplication.service';
import { BuyerService } from '@context/invoice/application/services/buyer.service';
import { SellerService } from '@context/invoice/application/services/seller.service';
import { PeriodStatusService } from '@context/invoice/application/services/period-status.service';
import { AlreadyBilledInvoiceNumberService } from '@context/invoice/application/services/already-billed.service';
import { InvoiceSkuAssociationService } from '@context/invoice/application/services/invoice-sku-association.service';
import { BuyerAssociationService } from '@context/invoice/application/services/buyer-association.service';
import { ContractValidationService } from '@context/invoice/application/services/contract-validation.service';

@Injectable()
export class InvoiceCreatorService {
  private readonly logger = new Logger(InvoiceCreatorService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(ExternalInvoice)
    private readonly externalInvoiceRepo: Repository<ExternalInvoice>,
    private readonly s3Service: S3Service,
    private readonly extractService: InvoiceExtractAttributesService,
    private readonly itemCreatorService: InvoiceItemCreatorService,
    private readonly duplicationService: InvoiceVerifyDuplicationService,
    private readonly buyerService: BuyerService,
    private readonly sellerService: SellerService,
    private readonly periodStatusService: PeriodStatusService,
    private readonly alreadyBilledService: AlreadyBilledInvoiceNumberService,
    private readonly skuAssociationService: InvoiceSkuAssociationService,
    private readonly buyerAssociationService: BuyerAssociationService,
    private readonly contractValidationService: ContractValidationService,
  ) {}

  async create(externalInvoice: ExternalInvoice, createdInvoiceNumbers: Set<string>): Promise<Invoice | null> {
    try {
      externalInvoice.status = ExternalInvoiceStatus.PROCESSING;
      await this.externalInvoiceRepo.save(externalInvoice);

      const xml = await this.fetchInvoiceData(externalInvoice);
      if (!xml) return null;

      const hash = parseXmlToHash(xml);
      const infNfe = extractInfNfe(hash);
      if (!infNfe) {
        await this.markError(externalInvoice, 'infNFe not found in XML');
        return null;
      }

      if (await this.duplicationService.isAccessKeyDuplicate(externalInvoice.accessKey)) {
        await this.markError(externalInvoice, `Duplicate access_key in Invoice: ${externalInvoice.accessKey}`);
        return null;
      }

      const attrs = this.extractService.extract(infNfe, externalInvoice.accessKey);

      if (
        await this.duplicationService.isDuplicate(attrs.invoiceNumber, attrs.date, attrs.buyerCnpj, attrs.sellerCnpj)
      ) {
        await this.markError(externalInvoice, 'Duplicate by business key (invoice_number + date + cnpjs)');
        return null;
      }

      if (createdInvoiceNumbers.has(attrs.invoiceNumber)) {
        this.logger.warn(`Duplicate invoice_number in batch: ${attrs.invoiceNumber}`);
        return null;
      }

      const buyer = await this.buyerService.findOrCreate(attrs.buyerCnpj);
      if (!buyer) {
        await this.markError(externalInvoice, `Varejista com CNPJ ${attrs.buyerCnpj} nao reconhecido`);
        return null;
      }

      const seller = await this.sellerService.findOrCreate(attrs.sellerCnpj);
      if (!seller) {
        await this.markError(externalInvoice, `Industria com CNPJ ${attrs.sellerCnpj} nao encontrada`);
        return null;
      }

      const sourceMap: Record<number, InvoiceSource> = {
        [ExternalInvoiceSource.QIVE]: InvoiceSource.QIVE,
        [ExternalInvoiceSource.IMAP]: InvoiceSource.IMAP,
        [ExternalInvoiceSource.BUYER]: InvoiceSource.BUYER,
      };

      const alreadyBilled = await this.alreadyBilledService.exists(
        attrs.invoiceNumber,
        attrs.buyerCnpj,
        attrs.sellerCnpj,
      );

      const referenceDate = await this.periodStatusService.adjustToOpenPeriod(attrs.date, seller.headquarter.id);

      const buyerAssociation = await this.buyerAssociationService.associate(buyer.headquarter.id, attrs.buyerCnpj);

      const invoice = this.invoiceRepo.create({
        invoiceNumber: attrs.invoiceNumber,
        date: attrs.date,
        value: attrs.value,
        accessKey: attrs.accessKey,
        buyerId: buyer.headquarter.id,
        sellerId: seller.headquarter.id,
        referenceDate,
        ufRecipient: attrs.ufRecipient,
        ufSender: attrs.ufSender,
        observations: attrs.observations,
        status: InvoiceStatus.PROCESSED,
        source: sourceMap[externalInvoice.source] ?? InvoiceSource.QIVE,
        ignoredReason: alreadyBilled ? InvoiceIgnoredReason.ALREADY_BILLED : InvoiceIgnoredReason.NOT_IGNORED,
        operation: attrs.operation,
        codeOperation: attrs.codeOperation,
        icmsdesonDiscountValue: attrs.icmsdesonDiscountValue,
        deliveryDate: attrs.deliveryDate,
        orderNumber: attrs.orderNumber,
        buyerAssociation,
        buyerCnpj: attrs.buyerCnpj,
        sellerCnpj: attrs.sellerCnpj,
        externalInvoiceId: externalInvoice.id,
      });

      const saved = await this.invoiceRepo.save(invoice);

      const hasContract = await this.contractValidationService.hasActiveContract(
        buyer.headquarter.id,
        seller.headquarter.id,
      );
      if (!hasContract) {
        await this.invoiceRepo.remove(saved);
        await this.markError(externalInvoice, 'No active contract between buyer and seller');
        return null;
      }

      const isDevolucao = attrs.operation === 'devolucao';
      const items = await this.itemCreatorService.createItems(saved.id, infNfe, isDevolucao);

      await this.skuAssociationService.associate(saved.id, buyer.headquarter.id);

      const updatedItems = await this.itemCreatorService['invoiceItemRepo'].find({
        where: { invoiceId: saved.id },
      });

      let mpNetValue = 0;
      let mpGrossValue = 0;

      for (const item of updatedItems) {
        // TODO: check if item.sku has mp = true when SKU table is available
      }

      saved.mpNetValue = mpNetValue;
      saved.mpGrossValue = mpGrossValue;
      await this.invoiceRepo.save(saved);

      createdInvoiceNumbers.add(attrs.invoiceNumber);

      externalInvoice.status = ExternalInvoiceStatus.PROCESSED;
      await this.externalInvoiceRepo.save(externalInvoice);

      this.logger.log(`Invoice created: id=${saved.id} access_key=${saved.accessKey}`);
      return saved;
    } catch (error) {
      this.logger.error(
        `Error creating invoice for ${externalInvoice.accessKey}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      await this.markError(externalInvoice, (error as Error).message);
      return null;
    }
  }

  private async fetchInvoiceData(externalInvoice: ExternalInvoice): Promise<string | null> {
    try {
      return await this.s3Service.readExternalInvoiceXml(externalInvoice.accessKey);
    } catch (error) {
      await this.markError(externalInvoice, 'Nao foi possivel fazer a leitura do arquivo');
      return null;
    }
  }

  private async markError(externalInvoice: ExternalInvoice, message: string): Promise<void> {
    externalInvoice.status = ExternalInvoiceStatus.ERROR;
    externalInvoice.errorMessage = message;
    await this.externalInvoiceRepo.save(externalInvoice);
    this.logger.error(`ExternalInvoice ${externalInvoice.id} marked as error: ${message}`);
  }
}
