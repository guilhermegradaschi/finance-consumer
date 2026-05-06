import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerFactory } from '@infra/http/circuit-breaker.factory';
import CircuitBreaker = require('opossum');

export interface SellerHeadquarter {
  id: number;
  company_name: string;
  cnpj: string;
}

export interface SellerDataResponse {
  headquarter: SellerHeadquarter;
}

@Injectable()
export class SellerApiClient implements OnModuleInit {
  private readonly logger = new Logger(SellerApiClient.name);
  private apiUrl!: string;
  private breaker!: CircuitBreaker<[string], SellerDataResponse | null>;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly cbFactory: CircuitBreakerFactory,
  ) {}

  onModuleInit(): void {
    this.apiUrl = this.configService.get<string>('SELLER_API_URL', '');
    this.breaker = this.cbFactory.create('seller-api', (url: string) => this.doGet(url));
  }

  async findOrCreateByCnpj(cnpj: string): Promise<SellerDataResponse | null> {
    try {
      return await this.breaker.fire(`${this.apiUrl}/api/v1/sellers/find_or_create?cnpj=${cnpj}`);
    } catch (error) {
      this.logger.warn(`Seller with CNPJ ${cnpj} not found: ${(error as Error).message}`);
      return null;
    }
  }

  private async doGet(url: string): Promise<SellerDataResponse | null> {
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
