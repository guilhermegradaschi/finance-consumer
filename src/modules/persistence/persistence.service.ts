import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { NotaFiscalRepository } from './repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from './repositories/nf-processing-log.repository';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NfEmitente } from './entities/nf-emitente.entity';
import { NfDestinatario } from './entities/nf-destinatario.entity';
import { NfItem } from './entities/nf-item.entity';
import { NfTransporte } from './entities/nf-transporte.entity';
import { NfPagamento } from './entities/nf-pagamento.entity';
import { NfValidatedEventDto } from '../business-validator/dto/nf-validated-event.dto';
import { NfStatus } from '../../common/enums/nf-status.enum';
import { NfSource } from '../../common/enums/nf-source.enum';
import { RetryableException } from '../../common/exceptions/retryable.exception';
import { EXCHANGES, ROUTING_KEYS } from '../../common/constants/queues.constants';

@Injectable()
export class PersistenceService {
  private readonly logger = new Logger(PersistenceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notaFiscalRepository: NotaFiscalRepository,
    private readonly processingLogRepository: NfProcessingLogRepository,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async persist(event: NfValidatedEventDto): Promise<void> {
    const startTime = Date.now();
    const processedData = event.processedData as Record<string, unknown>;

    const existing = await this.notaFiscalRepository.findByChaveAcesso(event.chaveAcesso);
    if (existing) {
      this.logger.warn(`NF already persisted: ${event.chaveAcesso}`);
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const nf = queryRunner.manager.create(NotaFiscal, {
        chaveAcesso: event.chaveAcesso,
        numero: processedData.numero as number,
        serie: (processedData.serie as number) ?? 1,
        modelo: (processedData.modelo as string) ?? '55',
        dataEmissao: new Date(processedData.dataEmissao as string),
        naturezaOperacao: (processedData.naturezaOperacao as string) ?? 'VENDA',
        tipoOperacao: (processedData.tipoOperacao as number) ?? 1,
        valorTotalProdutos: (processedData.valorTotalProdutos as number) ?? 0,
        valorTotalNf: (processedData.valorTotalNf as number) ?? 0,
        status: NfStatus.COMPLETED,
        source: event.source as NfSource,
        xmlS3Key: processedData.xmlS3Key as string,
        idempotencyKey: event.idempotencyKey,
        protocoloAutorizacao: event.sefazValidation?.protocoloAutorizacao ?? null,
        dataAutorizacao: event.sefazValidation?.dataAutorizacao ? new Date(event.sefazValidation.dataAutorizacao) : null,
        processedAt: new Date(),
        metadata: {},
      });

      const savedNf = await queryRunner.manager.save(NotaFiscal, nf);

      const emitData = processedData.emitente as Record<string, string> | undefined;
      if (emitData) {
        const emitente = queryRunner.manager.create(NfEmitente, {
          notaFiscalId: savedNf.id,
          cnpj: emitData.cnpj ?? '',
          razaoSocial: emitData.razaoSocial ?? '',
          nomeFantasia: emitData.nomeFantasia ?? null,
          inscricaoEstadual: emitData.inscricaoEstadual ?? null,
          uf: emitData.uf ?? null,
          logradouro: emitData.logradouro ?? null,
          numero: emitData.numero ?? null,
          bairro: emitData.bairro ?? null,
          codigoMunicipio: emitData.codigoMunicipio ?? null,
          nomeMunicipio: emitData.nomeMunicipio ?? null,
          cep: emitData.cep ?? null,
        });
        await queryRunner.manager.save(NfEmitente, emitente);
      }

      const destData = processedData.destinatario as Record<string, string> | undefined;
      if (destData) {
        const destinatario = queryRunner.manager.create(NfDestinatario, {
          notaFiscalId: savedNf.id,
          cnpj: destData.cnpj ?? null,
          cpf: destData.cpf ?? null,
          razaoSocial: destData.razaoSocial ?? '',
        });
        await queryRunner.manager.save(NfDestinatario, destinatario);
      }

      const itens = processedData.itens as Array<Record<string, unknown>> | undefined;
      if (itens?.length) {
        for (const itemData of itens) {
          const item = queryRunner.manager.create(NfItem, {
            notaFiscalId: savedNf.id,
            numeroItem: itemData.numeroItem as number,
            codigoProduto: (itemData.codigoProduto as string) ?? '',
            descricao: (itemData.descricao as string) ?? '',
            ncm: (itemData.ncm as string) ?? '',
            cfop: (itemData.cfop as string) ?? '',
            unidadeComercial: (itemData.unidadeComercial as string) ?? 'UN',
            quantidade: (itemData.quantidade as number) ?? 0,
            valorUnitario: (itemData.valorUnitario as number) ?? 0,
            valorTotal: (itemData.valorTotal as number) ?? 0,
          });
          await queryRunner.manager.save(NfItem, item);
        }
      }

      const transData = processedData.transporte as Record<string, unknown> | undefined;
      if (transData) {
        const transporte = queryRunner.manager.create(NfTransporte, {
          notaFiscalId: savedNf.id,
          modalidadeFrete: (transData.modalidadeFrete as number) ?? 9,
        });
        await queryRunner.manager.save(NfTransporte, transporte);
      }

      const pagData = processedData.pagamentos as Array<Record<string, unknown>> | undefined;
      if (pagData?.length) {
        for (const p of pagData) {
          const pagamento = queryRunner.manager.create(NfPagamento, {
            notaFiscalId: savedNf.id,
            formaPagamento: (p.formaPagamento as string) ?? '01',
            valor: (p.valor as number) ?? 0,
          });
          await queryRunner.manager.save(NfPagamento, pagamento);
        }
      }

      await queryRunner.commitTransaction();

      await this.processingLogRepository.logProcessingStep({
        notaFiscalId: savedNf.id,
        chaveAcesso: event.chaveAcesso,
        stage: 'PERSIST',
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
      });

      await this.rabbitMQService.publish(EXCHANGES.EVENTS, ROUTING_KEYS.NF_PERSISTED, {
        chaveAcesso: event.chaveAcesso,
        idempotencyKey: event.idempotencyKey,
        notaFiscalId: savedNf.id,
        status: NfStatus.COMPLETED,
        source: event.source,
        persistedAt: new Date().toISOString(),
      });

      this.logger.log(`NF persisted: ${event.chaveAcesso} (id: ${savedNf.id}) in ${Date.now() - startTime}ms`);
    } catch (error) {
      await queryRunner.rollbackTransaction();

      await this.processingLogRepository.logProcessingStep({
        chaveAcesso: event.chaveAcesso,
        stage: 'PERSIST',
        status: 'ERROR',
        errorMessage: (error as Error).message,
        durationMs: Date.now() - startTime,
      });

      throw new RetryableException(
        `Persistence failed: ${(error as Error).message}`,
        'NF010',
        { chaveAcesso: event.chaveAcesso },
      );
    } finally {
      await queryRunner.release();
    }
  }
}
