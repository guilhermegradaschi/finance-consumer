import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../s3.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((args) => args),
  GetObjectCommand: jest.fn().mockImplementation((args) => args),
  HeadObjectCommand: jest.fn().mockImplementation((args) => args),
  DeleteObjectCommand: jest.fn().mockImplementation((args) => args),
  ListObjectsV2Command: jest.fn().mockImplementation((args) => args),
}));

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(async () => {
    mockSend.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
              const map: Record<string, unknown> = {
                S3_BUCKET: 'nf-xmls',
                S3_ENDPOINT: 'http://localhost:9000',
                S3_REGION: 'us-east-1',
                S3_ACCESS_KEY: 'minioadmin',
                S3_SECRET_KEY: 'minioadmin',
                S3_FORCE_PATH_STYLE: true,
              };
              return map[key] ?? defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
    service.onModuleInit();
  });

  it('should build NF key with year/month path', () => {
    const key = service.buildNfKey('35240112345678000195550010000001231234567890');
    expect(key).toBe('nfe/24/01/35240112345678000195550010000001231234567890.xml');
  });

  it('should upload content', async () => {
    mockSend.mockResolvedValue({});
    await service.upload('test/key.xml', '<xml/>');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'nf-xmls',
        Key: 'test/key.xml',
        Body: '<xml/>',
      }),
    );
  });

  it('should download content', async () => {
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('<xml/>');
      },
    };
    mockSend.mockResolvedValue({ Body: mockStream });
    const result = await service.download('test/key.xml');
    expect(result).toBe('<xml/>');
  });

  it('should check existence - found', async () => {
    mockSend.mockResolvedValue({});
    const result = await service.exists('test/key.xml');
    expect(result).toBe(true);
  });

  it('should check existence - not found', async () => {
    mockSend.mockRejectedValue(new Error('NotFound'));
    const result = await service.exists('nonexistent.xml');
    expect(result).toBe(false);
  });

  it('should delete an object', async () => {
    mockSend.mockResolvedValue({});
    await service.delete('test/key.xml');
    expect(mockSend).toHaveBeenCalled();
  });

  it('should list by prefix', async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: 'nfe/24/01/abc.xml' }, { Key: 'nfe/24/01/def.xml' }],
    });
    const result = await service.listByPrefix('nfe/24/01/');
    expect(result).toEqual(['nfe/24/01/abc.xml', 'nfe/24/01/def.xml']);
  });

  it('should handle empty listing', async () => {
    mockSend.mockResolvedValue({ Contents: undefined });
    const result = await service.listByPrefix('empty/');
    expect(result).toEqual([]);
  });
});
