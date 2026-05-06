import { Module } from '@nestjs/common';
import { NfeLegacyModule } from '@context/nfe-legacy/nfe-legacy.module';
import { NfController } from '@context/nfe-legacy/infrastructure/http/nf.controller';
import { ReprocessController } from '@context/nfe-legacy/infrastructure/http/reprocess.controller';

@Module({
  imports: [NfeLegacyModule],
  controllers: [NfController, ReprocessController],
})
export class NfeLegacyHttpModule {}
