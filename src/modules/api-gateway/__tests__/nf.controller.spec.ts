import { Test, TestingModule } from '@nestjs/testing';
import { NfController } from '../controllers/nf.controller';
import { SubmitNfMultipartFieldsDto } from '../dto/submit-nf-multipart.dto';
import { NfReceiverService } from '../../nf-receiver/nf-receiver.service';
import { NotaFiscalRepository } from '../../persistence/repositories/nota-fiscal.repository';
import { NfProcessingLogRepository } from '../../persistence/repositories/nf-processing-log.repository';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { GetNfTimelineUseCase } from '../../../application/use-cases/get-nf-timeline.use-case';
import { AuditLogService } from '../../../application/audit-log.service';

describe('NfController', () => {
  let controller: NfController;
  const mockReceiver = { receive: jest.fn() };
  const mockNfRepo = { findByChaveAcesso: jest.fn(), findWithFilters: jest.fn(), getStatusSummary: jest.fn() };
  const mockLogRepo = { getLogsByChaveAcesso: jest.fn() };
  const mockTimeline = { execute: jest.fn() };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NfController],
      providers: [
        { provide: NfReceiverService, useValue: mockReceiver },
        { provide: NotaFiscalRepository, useValue: mockNfRepo },
        { provide: NfProcessingLogRepository, useValue: mockLogRepo },
        { provide: GetNfTimelineUseCase, useValue: mockTimeline },
        { provide: AuditLogService, useValue: mockAudit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
      ],
    }).compile();

    controller = module.get<NfController>(NfController);
  });

  it('should submit a NF and return 202', async () => {
    mockReceiver.receive.mockResolvedValue({
      chaveAcesso: '35240112345678000195550010000001231234567890',
      idempotencyKey: 'key1',
      status: 'RECEIVED',
      alreadyProcessed: false,
    });

    const file = {
      buffer: Buffer.from('<?xml version="1.0"?><root/>'),
      originalname: 'nf.xml',
    };

    const result = await controller.submit(file, {});
    expect(result.status).toBe('RECEIVED');
    expect(mockReceiver.receive).toHaveBeenCalledWith(
      expect.objectContaining({ xmlContent: expect.stringContaining('<root/>') }),
    );
  });

  it('should ignore Swagger-style metadataJson placeholder "undefined"', async () => {
    mockReceiver.receive.mockResolvedValue({
      chaveAcesso: '35240112345678000195550010000001231234567890',
      idempotencyKey: 'key1',
      status: 'RECEIVED',
      alreadyProcessed: false,
    });

    const file = { buffer: Buffer.from('<xml/>'), originalname: 'nf.xml' };
    const fields: SubmitNfMultipartFieldsDto = { metadataJson: 'undefined' };
    await controller.submit(file, fields);
    expect(mockReceiver.receive).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: undefined }),
    );
  });

  it('should list NFs with pagination', async () => {
    mockNfRepo.findWithFilters.mockResolvedValue({ data: [], total: 0 });

    const result = await controller.list({ page: 1, limit: 20 });
    expect(result.data).toEqual([]);
    expect(result.totalPages).toBe(0);
  });

  it('should get NF by chaveAcesso', async () => {
    const nf = { id: '1', chaveAcesso: 'abc' };
    mockNfRepo.findByChaveAcesso.mockResolvedValue(nf);

    const result = await controller.findByChaveAcesso('abc');
    expect(result).toBe(nf);
  });

  it('should throw NotFoundException when NF not found', async () => {
    mockNfRepo.findByChaveAcesso.mockResolvedValue(null);

    await expect(controller.findByChaveAcesso('notexist')).rejects.toThrow(NotFoundException);
  });

  it('should get processing logs', async () => {
    mockLogRepo.getLogsByChaveAcesso.mockResolvedValue([{ stage: 'RECEIVE', status: 'SUCCESS' }]);

    const result = await controller.getLogs('abc');
    expect(result).toHaveLength(1);
  });

  it('should get status summary', async () => {
    mockNfRepo.getStatusSummary.mockResolvedValue([{ status: 'COMPLETED', count: 10 }]);

    const result = await controller.summary();
    expect(result).toHaveLength(1);
  });
});
