import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EmailConsumerService } from '../email-consumer.service';
import { NfReceiverService } from '../../nf-receiver/nf-receiver.service';
import { NfSource } from '../../../common/enums/nf-source.enum';

describe('EmailConsumerService', () => {
  let service: EmailConsumerService;
  let tmpDir: string;

  const mockNfReceiverService = { receive: jest.fn() };

  const xmlContent = '<infNFe Id="NFe35240112345678000195550010000001231234567890" versao="4.00"><nNF>123</nNF></infNFe>';

  function buildConfigGet(overrides: Record<string, unknown> = {}) {
    const defaults: Record<string, unknown> = {
      IMAP_ENABLED: true,
      IMAP_MOCK_ENABLED: false,
      IMAP_MOCK_XML_PATH: '',
      IMAP_MOCK_FIXTURE: '',
    };
    const merged = { ...defaults, ...overrides };
    return (key: string, fallback?: unknown) =>
      merged[key] !== undefined ? merged[key] : fallback;
  }

  async function createService(configOverrides: Record<string, unknown> = {}): Promise<EmailConsumerService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailConsumerService,
        { provide: NfReceiverService, useValue: mockNfReceiverService },
        { provide: ConfigService, useValue: { get: buildConfigGet(configOverrides) } },
      ],
    }).compile();

    return module.get<EmailConsumerService>(EmailConsumerService);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'email-mock-'));
    service = await createService();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return empty and not call receive when mock is disabled', async () => {
    await service.pollEmails();
    expect(mockNfReceiverService.receive).not.toHaveBeenCalled();
  });

  it('should load a single file from IMAP_MOCK_XML_PATH and call receive', async () => {
    const filePath = path.join(tmpDir, 'nfe.xml');
    await fs.writeFile(filePath, xmlContent, 'utf-8');

    service = await createService({ IMAP_MOCK_ENABLED: true, IMAP_MOCK_XML_PATH: filePath });
    mockNfReceiverService.receive.mockResolvedValue({ status: 'RECEIVED' });

    await service.pollEmails();

    expect(mockNfReceiverService.receive).toHaveBeenCalledTimes(1);
    expect(mockNfReceiverService.receive).toHaveBeenCalledWith({
      xmlContent,
      source: NfSource.EMAIL,
    });
  });

  it('should load all XML files from a directory in IMAP_MOCK_XML_PATH', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.xml'), '<nfe>a</nfe>', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'b.xml'), '<nfe>b</nfe>', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'readme.txt'), 'ignored', 'utf-8');

    service = await createService({ IMAP_MOCK_ENABLED: true, IMAP_MOCK_XML_PATH: tmpDir });
    mockNfReceiverService.receive.mockResolvedValue({ status: 'RECEIVED' });

    await service.pollEmails();

    expect(mockNfReceiverService.receive).toHaveBeenCalledTimes(2);
    expect(mockNfReceiverService.receive).toHaveBeenNthCalledWith(1, {
      xmlContent: '<nfe>a</nfe>',
      source: NfSource.EMAIL,
    });
    expect(mockNfReceiverService.receive).toHaveBeenNthCalledWith(2, {
      xmlContent: '<nfe>b</nfe>',
      source: NfSource.EMAIL,
    });
  });

  it('should load fixtures by name from IMAP_MOCK_FIXTURE', async () => {
    service = await createService({ IMAP_MOCK_ENABLED: true, IMAP_MOCK_FIXTURE: 'valid-nfe' });
    mockNfReceiverService.receive.mockResolvedValue({ status: 'RECEIVED' });

    await service.pollEmails();

    expect(mockNfReceiverService.receive).toHaveBeenCalledTimes(1);
    const call = mockNfReceiverService.receive.mock.calls[0][0];
    expect(call.source).toBe(NfSource.EMAIL);
    expect(call.xmlContent).toContain('NFe35240112345678000195550010000001231234567890');
  });

  it('should handle comma-separated paths and fixtures together', async () => {
    const fileA = path.join(tmpDir, 'custom.xml');
    await fs.writeFile(fileA, '<nfe>custom</nfe>', 'utf-8');

    service = await createService({
      IMAP_MOCK_ENABLED: true,
      IMAP_MOCK_XML_PATH: fileA,
      IMAP_MOCK_FIXTURE: 'valid-nfe,invalid-nfe',
    });
    mockNfReceiverService.receive.mockResolvedValue({ status: 'RECEIVED' });

    await service.pollEmails();

    expect(mockNfReceiverService.receive).toHaveBeenCalledTimes(3);
  });

  it('should skip invalid paths gracefully and not call receive', async () => {
    service = await createService({
      IMAP_MOCK_ENABLED: true,
      IMAP_MOCK_XML_PATH: '/nonexistent/path/nfe.xml',
    });

    await service.pollEmails();

    expect(mockNfReceiverService.receive).not.toHaveBeenCalled();
  });

  it('should skip nonexistent fixtures gracefully and not call receive', async () => {
    service = await createService({
      IMAP_MOCK_ENABLED: true,
      IMAP_MOCK_FIXTURE: 'does-not-exist',
    });

    await service.pollEmails();

    expect(mockNfReceiverService.receive).not.toHaveBeenCalled();
  });
});
