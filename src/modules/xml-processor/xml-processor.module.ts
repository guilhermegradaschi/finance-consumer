import { Module } from '@nestjs/common';
import { XmlProcessorService } from './xml-processor.service';
import { XmlProcessorConsumer } from './xml-processor.consumer';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  providers: [XmlProcessorService, XmlProcessorConsumer],
  exports: [XmlProcessorService],
})
export class XmlProcessorModule {}
