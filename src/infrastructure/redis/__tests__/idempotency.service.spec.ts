import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from '../idempotency.service';
import { RedisService } from '../redis.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let redisService: Record<string, jest.Mock>;

  beforeEach(async () => {
    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      setNx: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: RedisService, useValue: redisService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(86400) },
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  describe('register', () => {
    it('should return true on first registration', async () => {
      redisService.setNx.mockResolvedValue(true);
      const result = await service.register('key1', { status: 'RECEIVED' });
      expect(result).toBe(true);
      expect(redisService.setNx).toHaveBeenCalledWith(
        'idempotency:key1',
        JSON.stringify({ status: 'RECEIVED' }),
        86400,
      );
    });

    it('should return false on duplicate registration', async () => {
      redisService.setNx.mockResolvedValue(false);
      const result = await service.register('key1', { status: 'RECEIVED' });
      expect(result).toBe(false);
    });
  });

  describe('check', () => {
    it('should return isDuplicate true when key exists', async () => {
      redisService.get.mockResolvedValue(JSON.stringify({ status: 'RECEIVED' }));
      const result = await service.check('key1');
      expect(result.isDuplicate).toBe(true);
      expect(result.existingData).toEqual({ status: 'RECEIVED' });
    });

    it('should return isDuplicate false when key does not exist', async () => {
      redisService.get.mockResolvedValue(null);
      const result = await service.check('key1');
      expect(result.isDuplicate).toBe(false);
      expect(result.existingData).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update existing key data', async () => {
      redisService.set.mockResolvedValue('OK');
      await service.update('key1', { status: 'COMPLETED' });
      expect(redisService.set).toHaveBeenCalledWith(
        'idempotency:key1',
        JSON.stringify({ status: 'COMPLETED' }),
        86400,
      );
    });
  });

  describe('remove', () => {
    it('should delete the key', async () => {
      redisService.del.mockResolvedValue(1);
      await service.remove('key1');
      expect(redisService.del).toHaveBeenCalledWith('idempotency:key1');
    });
  });
});
