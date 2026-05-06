import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { SefazClient } from '@context/nfe-legacy/infrastructure/sefaz/sefaz.client';

describe('SefazClient', () => {
  let client: SefazClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SefazClient,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn().mockReturnValue(of({ data: {} })),
          },
        },
      ],
    }).compile();

    client = module.get(SefazClient);
  });

  it('returns success for validateNfe', async () => {
    const r = await client.validateNfe('35240112345678000195550010000001231234567891');
    expect(r.valid).toBe(true);
    expect(r.status).toBe('AUTORIZADA');
  });
});
