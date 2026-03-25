import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NfItem } from './entities/nf-item.entity';
import { NfEmitente } from './entities/nf-emitente.entity';
import { NfDestinatario } from './entities/nf-destinatario.entity';
import { NfTransporte } from './entities/nf-transporte.entity';
import { NfPagamento } from './entities/nf-pagamento.entity';
import { NfProcessingLog } from './entities/nf-processing-log.entity';
import { NotaFiscalRepository } from './repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from './repositories/nf-processing-log.repository';
import { PersistenceService } from './persistence.service';
import { PersistenceConsumer } from './persistence.consumer';

const entities = [NotaFiscal, NfItem, NfEmitente, NfDestinatario, NfTransporte, NfPagamento, NfProcessingLog];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  providers: [NotaFiscalRepository, NfProcessingLogRepository, PersistenceService, PersistenceConsumer],
  exports: [TypeOrmModule, NotaFiscalRepository, NfProcessingLogRepository, PersistenceService],
})
export class PersistenceModule {}
