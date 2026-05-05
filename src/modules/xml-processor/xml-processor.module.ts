import { Module } from '@nestjs/common';
import { XmlProcessorService } from './xml-processor.service';
import { XmlProcessorConsumer } from './xml-processor.consumer';
import { NfeXsdValidationService } from './nfe-xsd-validation.service';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  providers: [XmlProcessorService, XmlProcessorConsumer, NfeXsdValidationService],
  exports: [XmlProcessorService, NfeXsdValidationService],
})
export class XmlProcessorModule {}
