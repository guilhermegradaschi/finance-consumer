import { Injectable, Logger } from '@nestjs/common';
import { BuyerApiClient, BuyerDataResponse } from '../../infrastructure/http/clients/buyer-api.client';

@Injectable()
export class BuyerService {
  private readonly logger = new Logger(BuyerService.name);

  constructor(private readonly buyerApiClient: BuyerApiClient) {}

  async findOrCreate(cnpj: string): Promise<BuyerDataResponse | null> {
    const buyer = await this.buyerApiClient.findByCnpj(cnpj);

    if (!buyer) {
      this.logger.warn(`Buyer with CNPJ ${cnpj} not found`);
      return null;
    }

    this.logger.log(`Buyer resolved: CNPJ=${cnpj} id=${buyer.headquarter.id}`);
    return buyer;
  }
}
