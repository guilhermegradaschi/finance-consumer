import { Test, TestingModule } from '@nestjs/testing';
import { NfReceiverService } from '../nf-receiver.service';
import { IdempotencyService } from '../../../infrastructure/redis/idempotency.service';
import { RabbitMQService } from '../../../infrastructure/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '../../persistence/repositories/nf-processing-log.repository';
import { NfSource } from '../../../common/enums/nf-source.enum';
import { NonRetryableException } from '../../../common/exceptions/non-retryable.exception';

describe('NfReceiverService', () => {
  let service: NfReceiverService;
  const mockIdempotencyService = { check: jest.fn(), register: jest.fn() };
  const mockRabbitMQService = { publish: jest.fn() };
  const mockProcessingLogRepository = { logProcessingStep: jest.fn() };

  const validXml = '<infNFe Id="NFe35240112345678000195550010000001231234567890" versao="4.00"><nNF>123</nNF></infNFe>';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockProcessingLogRepository.logProcessingStep.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NfReceiverService,
        { provide: IdempotencyService, useValue: mockIdempotencyService },
        { provide: RabbitMQService, useValue: mockRabbitMQService },
        { provide: NfProcessingLogRepository, useValue: mockProcessingLogRepository },
      ],
    }).compile();

    service = module.get<NfReceiverService>(NfReceiverService);
  });

  it('should receive a valid NF and return RECEIVED status', async () => {
    mockIdempotencyService.check.mockResolvedValue({ isDuplicate: false });
    mockIdempotencyService.register.mockResolvedValue(true);
    mockRabbitMQService.publish.mockResolvedValue(undefined);

    const result = await service.receive({ xmlContent: validXml, source: NfSource.API });

    expect(result.status).toBe('RECEIVED');
    expect(result.alreadyProcessed).toBe(false);
    expect(result.chaveAcesso).toBe('35240112345678000195550010000001231234567890');
    expect(mockRabbitMQService.publish).toHaveBeenCalled();
  });

  it('should return DUPLICATE for already-processed NF (idempotency)', async () => {
    mockIdempotencyService.check.mockResolvedValue({
      isDuplicate: true,
      existingData: { status: 'RECEIVED' },
    });

    const result = await service.receive({ xmlContent: validXml, source: NfSource.API });

    expect(result.alreadyProcessed).toBe(true);
    expect(result.status).toBe('DUPLICATE');
    expect(mockRabbitMQService.publish).not.toHaveBeenCalled();
  });

  it('should throw NonRetryableException for invalid XML and log REJECTED', async () => {
    await expect(service.receive({ xmlContent: '<invalid/>' })).rejects.toThrow(NonRetryableException);

    expect(mockProcessingLogRepository.logProcessingStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'RECEIVE',
        status: 'REJECTED',
        errorCode: 'NF003',
      }),
    );
  });

  it('should throw NonRetryableException for empty XML and log REJECTED', async () => {
    await expect(service.receive({ xmlContent: '' })).rejects.toThrow(NonRetryableException);

    expect(mockProcessingLogRepository.logProcessingStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'RECEIVE',
        status: 'REJECTED',
        errorCode: 'NF003',
      }),
    );
  });
});
