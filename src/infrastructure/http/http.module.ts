import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CircuitBreakerFactory } from '@infra/http/circuit-breaker.factory';
import { QiveClient } from '@infra/http/clients/qive.client';
import { BuyerApiClient } from '@infra/http/clients/buyer-api.client';
import { SellerApiClient } from '@infra/http/clients/seller-api.client';

@Global()
@Module({
  imports: [HttpModule],
  providers: [CircuitBreakerFactory, QiveClient, BuyerApiClient, SellerApiClient],
  exports: [CircuitBreakerFactory, QiveClient, BuyerApiClient, SellerApiClient],
})
export class HttpInfraModule {}
