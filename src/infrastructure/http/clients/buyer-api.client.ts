import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerFactory } from '../circuit-breaker.factory';
import CircuitBreaker = require('opossum');

export interface BuyerHeadquarter {
  id: number;
  name: string;
}

export interface BuyerDataResponse {
  headquarter: BuyerHeadquarter;
}

export interface BuyerCnpj {
  cnpj: string;
  name: string;
}

export interface BuyerBrand {
  id: number;
  name: string;
}

@Injectable()
export class BuyerApiClient implements OnModuleInit {
  private readonly logger = new Logger(BuyerApiClient.name);
  private apiUrl!: string;
  private breaker!: CircuitBreaker<[string], BuyerDataResponse | null>;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly cbFactory: CircuitBreakerFactory,
  ) {}

  onModuleInit(): void {
    this.apiUrl = this.configService.get<string>('BUYER_API_URL', '');
    this.breaker = this.cbFactory.create('buyer-api', (url: string) => this.doGet(url));
  }

  async findByCnpj(cnpj: string): Promise<BuyerDataResponse | null> {
    try {
      return await this.breaker.fire(`${this.apiUrl}/api/v1/buyers/cnpj/${cnpj}`);
    } catch (error) {
      this.logger.warn(`Buyer with CNPJ ${cnpj} not found: ${(error as Error).message}`);
      return null;
    }
  }

  async fetchBuyerCnpjs(externalId: number): Promise<BuyerCnpj[]> {
    try {
      const data = await this.breaker.fire(`${this.apiUrl}/api/v1/buyers/${externalId}/cnpjs`);
      return (data as unknown as BuyerCnpj[]) ?? [];
    } catch (error) {
      this.logger.warn(`Failed to fetch buyer CNPJs for ${externalId}: ${(error as Error).message}`);
      return [];
    }
  }

  async fetchBuyerBrands(buyerExternalId: number): Promise<BuyerBrand[]> {
    try {
      const data = await this.breaker.fire(`${this.apiUrl}/api/v1/buyers/${buyerExternalId}/brands`);
      return (data as unknown as BuyerBrand[]) ?? [];
    } catch (error) {
      this.logger.warn(`Failed to fetch buyer brands for ${buyerExternalId}: ${(error as Error).message}`);
      return [];
    }
  }

  private async doGet(url: string): Promise<BuyerDataResponse | null> {
    try {
      const { data } = await firstValueFrom(this.httpService.get(url));
      return data;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      throw error;
    }
  }
}
