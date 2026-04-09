import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalInvoice } from '../persistence/entities/external-invoice.entity';
import { Invoice } from '../persistence/entities/invoice.entity';
import { InvoiceItem } from '../persistence/entities/invoice-item.entity';
import { S3Module } from '../../infrastructure/s3/s3.module';
import { ExternalInvoicesProcessorService } from './external-invoices-processor.service';
import { InvoiceCreatorService } from './invoice-creator.service';
import { InvoiceExtractAttributesService } from './invoice-extract-attributes.service';
import { InvoiceItemCreatorService } from './invoice-item-creator.service';
import { InvoiceVerifyDuplicationService } from './invoice-verify-duplication.service';
import { BuyerService } from './buyer.service';
import { SellerService } from './seller.service';
import { PeriodStatusService } from './period-status.service';
import { AlreadyBilledInvoiceNumberService } from './already-billed.service';
import { InvoiceSkuAssociationService } from './invoice-sku-association.service';
import { BuyerAssociationService } from './buyer-association.service';
import { ContractValidationService } from './contract-validation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalInvoice, Invoice, InvoiceItem]),
    S3Module,
  ],
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
  exports: [ExternalInvoicesProcessorService, InvoiceCreatorService],
})
export class InvoiceProcessorModule {}
