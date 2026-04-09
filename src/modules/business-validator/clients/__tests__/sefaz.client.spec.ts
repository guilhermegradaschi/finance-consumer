import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SefazClient } from '../sefaz.client';
import { CircuitBreakerFactory } from '../../../../infrastructure/http/circuit-breaker.factory';

describe('SefazClient', () => {
  let client: SefazClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SefazClient,
        {
          provide: CircuitBreakerFactory,
          useValue: {
            create: jest.fn().mockImplementation((_n, fn) => {
              const breaker = {
                fire: (ch: string) => fn(ch),
                fallback: jest.fn().mockReturnThis(),
              };
              return breaker;
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              mockEnabled: true,
              webserviceUrl: '',
              certPath: '',
              certPassword: '',
              tpAmb: '2',
              requestTimeoutMs: 5000,
            }),
          },
        },
      ],
    }).compile();

    client = module.get(SefazClient);
    await client.onModuleInit();
  });

  it('returns mock success when mock enabled', async () => {
    const r = await client.validateNfe('35240112345678000195550010000001231234567891');
    expect(r.valid).toBe(true);
    expect(r.status).toContain('MOCK');
  });
});
