import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NfItem } from './entities/nf-item.entity';
import { NfEmitente } from './entities/nf-emitente.entity';
import { NfDestinatario } from './entities/nf-destinatario.entity';
import { NfTransporte } from './entities/nf-transporte.entity';
import { NfPagamento } from './entities/nf-pagamento.entity';
import { NfProcessingLog } from './entities/nf-processing-log.entity';
import { ExternalInvoice } from './entities/external-invoice.entity';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { InvoiceImport } from './entities/invoice-import.entity';
import { InvoiceImportLog } from './entities/invoice-import-log.entity';
import { InvoiceEvent } from './entities/invoice-event.entity';
import { InvoiceEventsImport } from './entities/invoice-events-import.entity';
import { NotaFiscalRepository } from './repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from './repositories/nf-processing-log.repository';
import { PersistenceService } from './persistence.service';
import { PersistenceConsumer } from './persistence.consumer';

const legacyEntities = [NotaFiscal, NfItem, NfEmitente, NfDestinatario, NfTransporte, NfPagamento, NfProcessingLog];
const pipelineEntities = [ExternalInvoice, Invoice, InvoiceItem, InvoiceImport, InvoiceImportLog, InvoiceEvent, InvoiceEventsImport];
const entities = [...legacyEntities, ...pipelineEntities];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  providers: [NotaFiscalRepository, NfProcessingLogRepository, PersistenceService, PersistenceConsumer],
  exports: [TypeOrmModule, NotaFiscalRepository, NfProcessingLogRepository, PersistenceService],
})
export class PersistenceModule {}
