import { Module } from '@nestjs/common';
import { XmlProcessorService } from './xml-processor.service';
import { XmlProcessorConsumer } from './xml-processor.consumer';

@Module({
  providers: [XmlProcessorService, XmlProcessorConsumer],
  exports: [XmlProcessorService],
})
export class XmlProcessorModule {}
