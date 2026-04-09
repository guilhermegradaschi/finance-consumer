import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BusinessValidatorService } from './business-validator.service';
import { BusinessValidatorConsumer } from './business-validator.consumer';
import { ReceitaWsClient } from './clients/receita-ws.client';
import { SefazClient } from './clients/sefaz.client';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [HttpModule, PersistenceModule],
  providers: [BusinessValidatorService, BusinessValidatorConsumer, ReceitaWsClient, SefazClient],
  exports: [BusinessValidatorService],
})
export class BusinessValidatorModule {}
