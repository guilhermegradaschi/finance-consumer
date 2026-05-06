import { Injectable, Logger } from '@nestjs/common';
import { SellerApiClient, SellerDataResponse } from '@infra/http/clients/seller-api.client';

@Injectable()
export class SellerService {
  private readonly logger = new Logger(SellerService.name);

  constructor(private readonly sellerApiClient: SellerApiClient) {}

  async findOrCreate(cnpj: string): Promise<SellerDataResponse | null> {
    const seller = await this.sellerApiClient.findOrCreateByCnpj(cnpj);

    if (!seller) {
      this.logger.warn(`Seller with CNPJ ${cnpj} not found`);
      return null;
    }

    this.logger.log(`Seller resolved: CNPJ=${cnpj} id=${seller.headquarter.id}`);
    return seller;
  }
}
