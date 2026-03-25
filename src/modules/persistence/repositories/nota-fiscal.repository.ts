import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
import { NfStatus } from '../../../common/enums/nf-status.enum';
import { NfSource } from '../../../common/enums/nf-source.enum';

export interface FindNfFilters {
  status?: NfStatus;
  source?: NfSource;
  dataEmissaoInicio?: Date;
  dataEmissaoFim?: Date;
  cnpjEmitente?: string;
  chaveAcesso?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class NotaFiscalRepository extends Repository<NotaFiscal> {
  constructor(private dataSource: DataSource) {
    super(NotaFiscal, dataSource.createEntityManager());
  }

  async findByChaveAcesso(chaveAcesso: string): Promise<NotaFiscal | null> {
    return this.findOne({
      where: { chaveAcesso },
      relations: ['emitente', 'destinatario', 'itens', 'transporte', 'pagamentos'],
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<NotaFiscal | null> {
    return this.findOne({ where: { idempotencyKey } });
  }

  async findWithFilters(filters: FindNfFilters): Promise<{ data: NotaFiscal[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.createQueryBuilder('nf')
      .leftJoinAndSelect('nf.emitente', 'emitente')
      .leftJoinAndSelect('nf.destinatario', 'destinatario');

    if (filters.status) {
      qb.andWhere('nf.status = :status', { status: filters.status });
    }
    if (filters.source) {
      qb.andWhere('nf.source = :source', { source: filters.source });
    }
    if (filters.dataEmissaoInicio && filters.dataEmissaoFim) {
      qb.andWhere('nf.dataEmissao BETWEEN :inicio AND :fim', {
        inicio: filters.dataEmissaoInicio,
        fim: filters.dataEmissaoFim,
      });
    }
    if (filters.cnpjEmitente) {
      qb.andWhere('emitente.cnpj = :cnpj', { cnpj: filters.cnpjEmitente });
    }
    if (filters.chaveAcesso) {
      qb.andWhere('nf.chaveAcesso = :chaveAcesso', { chaveAcesso: filters.chaveAcesso });
    }

    qb.orderBy('nf.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async updateStatus(id: string, status: NfStatus, errorMessage?: string): Promise<void> {
    const updateData: Record<string, unknown> = { status };
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }
    if (status === NfStatus.COMPLETED) {
      updateData.processedAt = new Date();
    }
    await this.update(id, updateData);
  }

  async incrementRetryCount(id: string): Promise<void> {
    await this.increment({ id }, 'retryCount', 1);
  }

  async getStatusSummary(): Promise<{ status: NfStatus; count: number }[]> {
    return this.createQueryBuilder('nf')
      .select('nf.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('nf.status')
      .getRawMany();
  }
}
