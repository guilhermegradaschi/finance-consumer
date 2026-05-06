import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AlreadyBilledInvoiceNumberService {
  private readonly logger = new Logger(AlreadyBilledInvoiceNumberService.name);

  /**
   * Checks if an invoice number has already been billed.
   * In the finance-api, this queries InvoiceItem + ManualBillingItem + Sellin
   * that are linked to BillingItem with status "billed".
   *
   * Full implementation requires access to billing-related tables.
   */
  async exists(_invoiceNumber: string, _buyerCnpj: string, _sellerCnpj: string): Promise<boolean> {
    // TODO: Implement when billing tables are available
    return false;
  }
}
