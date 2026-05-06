import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceEvent } from '@context/invoice-events/domain/entities/invoice-event.entity';
import { InvoiceEventStatus } from '@context/invoice-events/domain/enums/invoice-event-status.enum';
import { S3Service } from '@infra/s3/s3.service';

@Injectable()
export class InvoiceEventCreatorService {
  private readonly logger = new Logger(InvoiceEventCreatorService.name);

  constructor(
    @InjectRepository(InvoiceEvent)
    private readonly invoiceEventRepo: Repository<InvoiceEvent>,
    private readonly s3Service: S3Service,
  ) {}

  async create(accessKey: string, eventType: string, xml: string): Promise<InvoiceEvent | null> {
    const existing = await this.invoiceEventRepo.findOne({
      where: { accessKey, eventType },
    });

    if (existing) {
      this.logger.warn(`Duplicate event: access_key=${accessKey} type=${eventType}`);
      return null;
    }

    const filename = await this.s3Service.uploadInvoiceEventXml(accessKey, eventType, xml);

    const event = this.invoiceEventRepo.create({
      accessKey,
      eventType,
      filename,
      status: InvoiceEventStatus.PENDING,
    });

    const saved = await this.invoiceEventRepo.save(event);
    this.logger.log(`Created InvoiceEvent ${saved.id}: access_key=${accessKey} type=${eventType}`);
    return saved;
  }
}
