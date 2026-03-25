import { Test, TestingModule } from '@nestjs/testing';
import { BusinessValidatorService } from '../business-validator.service';
import { RabbitMQService } from '../../../infrastructure/rabbitmq/rabbitmq.service';
import { ReceitaWsClient } from '../clients/receita-ws.client';
import { SefazClient } from '../clients/sefaz.client';

describe('BusinessValidatorService', () => {
  let service: BusinessValidatorService;
  const mockRabbitMQ = { publish: jest.fn() };
  const mockReceitaWs = { validateCnpj: jest.fn() };
  const mockSefaz = { validateNfe: jest.fn() };

  const event = {
    chaveAcesso: '35240112345678000195550010000001231234567890',
    idempotencyKey: 'key1',
    xmlS3Key: 'nfe/24/01/test.xml',
    numero: 123,
    serie: 1,
    modelo: '55',
    dataEmissao: '2024-01-15T10:00:00-03:00',
    naturezaOperacao: 'VENDA',
    tipoOperacao: 1,
    valorTotalProdutos: 1500,
    valorTotalNf: 1500,
    emitente: { cnpj: '12345678000195', razaoSocial: 'Test' },
    destinatario: { razaoSocial: 'Dest' },
    itens: [],
    source: 'API',
    processedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessValidatorService,
        { provide: RabbitMQService, useValue: mockRabbitMQ },
        { provide: ReceitaWsClient, useValue: mockReceitaWs },
        { provide: SefazClient, useValue: mockSefaz },
      ],
    }).compile();

    service = module.get<BusinessValidatorService>(BusinessValidatorService);
  });

  it('should validate successfully (happy path)', async () => {
    mockReceitaWs.validateCnpj.mockResolvedValue({ cnpj: '12345678000195', valid: true, razaoSocial: 'Test' });
    mockSefaz.validateNfe.mockResolvedValue({ valid: true, protocoloAutorizacao: 'PROT123' });
    mockRabbitMQ.publish.mockResolvedValue(undefined);

    const result = await service.validate(event);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(mockRabbitMQ.publish).toHaveBeenCalled();
  });

  it('should report invalid CNPJ', async () => {
    mockReceitaWs.validateCnpj.mockResolvedValue({ cnpj: '12345678000195', valid: false, situacao: 'BAIXADA' });
    mockSefaz.validateNfe.mockResolvedValue({ valid: true });
    mockRabbitMQ.publish.mockResolvedValue(undefined);

    const result = await service.validate(event);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should report invalid SEFAZ result', async () => {
    mockReceitaWs.validateCnpj.mockResolvedValue({ cnpj: '12345678000195', valid: true });
    mockSefaz.validateNfe.mockResolvedValue({ valid: false, status: 'DENEGADA' });
    mockRabbitMQ.publish.mockResolvedValue(undefined);

    const result = await service.validate(event);

    expect(result.isValid).toBe(false);
  });

  it('should propagate ReceitaWS errors as retryable', async () => {
    mockReceitaWs.validateCnpj.mockRejectedValue(new Error('Timeout'));

    await expect(service.validate(event)).rejects.toThrow();
  });
});
