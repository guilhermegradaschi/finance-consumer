import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '@context/invoice/domain/entities/invoice.entity';
import { InvoiceItem } from '@context/invoice/domain/entities/invoice-item.entity';
import { ExternalInvoice } from '@context/invoice/domain/entities/external-invoice.entity';
import { ExternalInvoicesProcessorService } from '@context/invoice/application/services/external-invoices-processor.service';
import { InvoiceCreatorService } from '@context/invoice/application/services/invoice-creator.service';
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
import { S3Module } from '@infra/s3/s3.module';
import { NfeLegacyModule } from '@context/nfe-legacy/nfe-legacy.module';

const invoiceEntities = [Invoice, InvoiceItem, ExternalInvoice];

@Module({
  imports: [TypeOrmModule.forFeature(invoiceEntities), S3Module, NfeLegacyModule],
  providers: [
    ExternalInvoicesProcessorService,
    InvoiceCreatorService,
    InvoiceExtractAttributesService,
    InvoiceItemCreatorService,
    InvoiceVerifyDuplicationService,
    BuyerService,
    SellerService,
    PeriodStatusService,
    AlreadyBilledInvoiceNumberService,
    InvoiceSkuAssociationService,
    BuyerAssociationService,
    ContractValidationService,
  ],
  exports: [TypeOrmModule, ExternalInvoicesProcessorService, InvoiceCreatorService],
})
export class InvoiceModule {}
