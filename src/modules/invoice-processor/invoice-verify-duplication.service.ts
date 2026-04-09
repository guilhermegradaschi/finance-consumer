import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../persistence/entities/invoice.entity';

@Injectable()
export class InvoiceVerifyDuplicationService {
  private readonly logger = new Logger(InvoiceVerifyDuplicationService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async isDuplicate(
    invoiceNumber: string,
    date: Date,
    buyerCnpj: string,
    sellerCnpj: string,
  ): Promise<boolean> {
    const existing = await this.invoiceRepo.findOne({
      where: {
        invoiceNumber,
        date,
        buyerCnpj,
        sellerCnpj,
      },
    });

    if (existing) {
      this.logger.warn(
        `Duplicate invoice found: number=${invoiceNumber} date=${date.toISOString()} buyer=${buyerCnpj} seller=${sellerCnpj}`,
      );
      return true;
    }

    return false;
  }

  async isAccessKeyDuplicate(accessKey: string): Promise<boolean> {
    const existing = await this.invoiceRepo.findOne({ where: { accessKey } });
    return !!existing;
  }
}
