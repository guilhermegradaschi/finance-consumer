import { Module } from '@nestjs/common';
import { InvoiceModule } from '@context/invoice/invoice.module';
import { AdminInvoiceReprocessController } from '@context/invoice/infrastructure/http/admin-invoice-reprocess.controller';

@Module({
  imports: [InvoiceModule],
  controllers: [AdminInvoiceReprocessController],
})
export class InvoiceHttpModule {}
