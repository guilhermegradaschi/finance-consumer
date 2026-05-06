import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ContractValidationService {
  private readonly logger = new Logger(ContractValidationService.name);

  /**
   * Verifies that an active contract exists between buyer (+ network buyers) and seller.
   * Contract must have end_date = null or end_date >= today.
   *
   * If no contract exists, the invoice should be destroyed and ExternalInvoice
   * marked as error.
   *
   * Full implementation requires access to the contracts table.
   */
  async hasActiveContract(_buyerId: number, _sellerId: number): Promise<boolean> {
    // TODO: Query contracts table
    // SELECT 1 FROM contracts
    // WHERE buyer_id = ? AND seller_id = ?
    // AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    return true;
  }
}
