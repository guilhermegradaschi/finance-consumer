import { Module } from '@nestjs/common';
import { NfeLegacyModule } from '@context/nfe-legacy/nfe-legacy.module';
import { XmlProcessorConsumer } from '@context/nfe-legacy/application/consumers/xml-processor.consumer';
import { BusinessValidatorConsumer } from '@context/nfe-legacy/application/consumers/business-validator.consumer';
import { PersistenceConsumer } from '@context/nfe-legacy/application/consumers/persistence.consumer';

@Module({
  imports: [NfeLegacyModule],
  providers: [XmlProcessorConsumer, BusinessValidatorConsumer, PersistenceConsumer],
})
export class NfeLegacyWorkersModule {}
