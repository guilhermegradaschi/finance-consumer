import { Test, TestingModule } from '@nestjs/testing';
import { NfReceiverService } from '@context/ingestion/application/services/nf-receiver.service';
import { SubmitIngestionService } from '@context/ingestion/application/services/submit-ingestion.service';
import { NfSource } from '@shared/enums/nf-source.enum';

describe('NfReceiverService', () => {
  let service: NfReceiverService;
  const mockSubmit = { submit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [NfReceiverService, { provide: SubmitIngestionService, useValue: mockSubmit }],
    }).compile();

    service = module.get<NfReceiverService>(NfReceiverService);
  });

  it('delegates receive to SubmitIngestionService', async () => {
    const dto = { xmlContent: '<x/>', source: NfSource.API };
    mockSubmit.submit.mockResolvedValue({
      chaveAcesso: '35240112345678000195550010000001231234567890',
      idempotencyKey: 'k',
      status: 'RECEIVED',
      alreadyProcessed: false,
    });

    const result = await service.receive(dto);

    expect(mockSubmit.submit).toHaveBeenCalledWith(dto);
    expect(result.status).toBe('RECEIVED');
  });
});
