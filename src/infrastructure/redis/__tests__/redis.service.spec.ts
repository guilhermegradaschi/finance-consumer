import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@infra/redis/redis.service';

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setnx: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    })),
  };
});

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_DB: 0,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    await service.onModuleInit();
  });

  it('should ping Redis', async () => {
    const result = await service.ping();
    expect(result).toBe('PONG');
  });

  it('should get a value', async () => {
    const result = await service.get('key');
    expect(result).toBeNull();
  });

  it('should set a value', async () => {
    const result = await service.set('key', 'value');
    expect(result).toBe('OK');
  });

  it('should set with TTL', async () => {
    const result = await service.set('key', 'value', 60);
    expect(result).toBe('OK');
  });

  it('should setNx (acquire lock)', async () => {
    const result = await service.setNx('key', 'value');
    expect(result).toBe(true);
  });

  it('should delete a key', async () => {
    const result = await service.del('key');
    expect(result).toBe(1);
  });

  it('should check existence', async () => {
    const result = await service.exists('key');
    expect(result).toBe(true);
  });

  it('should increment a key', async () => {
    const result = await service.incr('counter');
    expect(result).toBe(1);
  });

  it('should set expiry on a key', async () => {
    const result = await service.expire('key', 60);
    expect(result).toBe(true);
  });

  it('should quit on module destroy', async () => {
    await service.onModuleDestroy();
    expect(service.getClient().quit).toHaveBeenCalled();
  });
});
