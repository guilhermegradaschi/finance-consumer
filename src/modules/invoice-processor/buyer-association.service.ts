import { Injectable, Logger } from '@nestjs/common';
import { BuyerApiClient } from '../../infrastructure/http/clients/buyer-api.client';

@Injectable()
export class BuyerAssociationService {
  private readonly logger = new Logger(BuyerAssociationService.name);

  constructor(private readonly buyerApiClient: BuyerApiClient) {}

  /**
   * Determines buyer_association value by matching CNPJ.
   * Match strategies:
   * 1. Full CNPJ match (14 chars)
   * 2. Radical match (first 8 chars - same headquarter group)
   */
  async associate(buyerId: number, buyerCnpj: string): Promise<string | null> {
    try {
      const cnpjs = await this.buyerApiClient.fetchBuyerCnpjs(buyerId);

      for (const entry of cnpjs) {
        if (entry.cnpj === buyerCnpj) {
          return 'full_match';
        }
      }

      const radical = buyerCnpj.substring(0, 8);
      for (const entry of cnpjs) {
        if (entry.cnpj.substring(0, 8) === radical) {
          return 'radical_match';
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to determine buyer_association for buyer ${buyerId}: ${(error as Error).message}`);
      return null;
    }
  }
}
