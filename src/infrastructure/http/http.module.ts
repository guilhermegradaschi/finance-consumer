import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CircuitBreakerFactory } from './circuit-breaker.factory';
import { QiveClient } from './clients/qive.client';
import { BuyerApiClient } from './clients/buyer-api.client';
import { SellerApiClient } from './clients/seller-api.client';

@Global()
@Module({
  imports: [HttpModule],
  providers: [CircuitBreakerFactory, QiveClient, BuyerApiClient, SellerApiClient],
  exports: [CircuitBreakerFactory, QiveClient, BuyerApiClient, SellerApiClient],
})
export class HttpInfraModule {}
