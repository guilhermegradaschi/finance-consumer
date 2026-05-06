import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { XmlProcessorService } from '@context/nfe-legacy/infrastructure/xml/xml-processor.service';
import { S3Service } from '@infra/s3/s3.service';
import { RabbitMQService } from '@infra/messaging/rabbitmq/rabbitmq.service';
import { NfProcessingLogRepository } from '@context/nfe-legacy/domain/repositories/nf-processing-log.repository';
import { NfeXsdValidationService } from '@context/nfe-legacy/infrastructure/xml/nfe-xsd-validation.service';
import { NonRetryableException } from '@shared/exceptions/non-retryable.exception';
import { RetryableException } from '@shared/exceptions/retryable.exception';
import { NfReceivedEventDto } from '@context/ingestion/application/dto/nf-received-event.dto';

describe('XmlProcessorService', () => {
  let service: XmlProcessorService;
  const mockS3 = { upload: jest.fn(), buildNfKey: jest.fn(), download: jest.fn() };
  const mockRabbitMQ = { publish: jest.fn() };
  const mockLog = { logProcessingStep: jest.fn().mockResolvedValue({}) };
  const mockXsd = { validateOrSkip: jest.fn() };

  const validEvent = {
    chaveAcesso: '35240112345678000195550010000001231234567890',
    xmlContent:
      '<nfeProc><NFe><infNFe Id="NFe35240112345678000195550010000001231234567890" versao="4.00"><ide><nNF>123</nNF><serie>1</serie><mod>55</mod><dhEmi>2024-01-15T10:00:00-03:00</dhEmi><natOp>VENDA</natOp><tpNF>1</tpNF></ide><total><ICMSTot><vProd>1500.00</vProd><vNF>1500.00</vNF></ICMSTot></total><emit><CNPJ>12345678000195</CNPJ><xNome>Empresa Test</xNome></emit></infNFe></NFe></nfeProc>',
    source: 'API',
    idempotencyKey: 'abc123',
    receivedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XmlProcessorService,
        { provide: S3Service, useValue: mockS3 },
        { provide: RabbitMQService, useValue: mockRabbitMQ },
        { provide: NfProcessingLogRepository, useValue: mockLog },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(false) } },
        { provide: NfeXsdValidationService, useValue: mockXsd },
      ],
    }).compile();

    service = module.get<XmlProcessorService>(XmlProcessorService);
  });

  it('should process valid XML, upload to S3, and publish event', async () => {
    mockS3.buildNfKey.mockReturnValue('nfe/24/01/35240112345678000195550010000001231234567890.xml');
    mockS3.upload.mockResolvedValue(undefined);
    mockRabbitMQ.publish.mockResolvedValue(undefined);

    await service.process(validEvent);

    expect(mockS3.upload).toHaveBeenCalled();
    expect(mockRabbitMQ.publish).toHaveBeenCalled();
  });

  it('should throw NonRetryableException for unparseable XML', async () => {
    const badEvent = { ...validEvent, xmlContent: '<broken' };
    await expect(service.process(badEvent)).rejects.toThrow(NonRetryableException);
  });

  it('should throw RetryableException when S3 upload fails', async () => {
    mockS3.buildNfKey.mockReturnValue('nfe/24/01/test.xml');
    mockS3.upload.mockRejectedValue(new Error('S3 timeout'));

    await expect(service.process(validEvent)).rejects.toThrow(RetryableException);
  });

  it('should download from S3 when rawStorageKey is set without xmlContent', async () => {
    mockS3.download.mockResolvedValue(validEvent.xmlContent);
    const slimEvent = {
      ...validEvent,
      xmlContent: undefined,
      rawStorageKey: 'nfe/raw/2024/01/35240112345678000195550010000001231234567890.xml',
      preUploadedToS3: true,
    };

    mockRabbitMQ.publish.mockResolvedValue(undefined);

    await service.process(slimEvent as unknown as NfReceivedEventDto);

    expect(mockS3.download).toHaveBeenCalledWith(slimEvent.rawStorageKey);
    expect(mockS3.upload).not.toHaveBeenCalled();
    expect(mockRabbitMQ.publish).toHaveBeenCalled();
  });

  it('should parse XML and extract metadata correctly', () => {
    const metadata = service.parseXml(validEvent.xmlContent);
    expect(metadata.numero).toBe(123);
    expect(metadata.serie).toBe(1);
    expect(metadata.emitente.cnpj).toBe('12345678000195');
    expect(metadata.emitente.razaoSocial).toBe('Empresa Test');
  });
});
