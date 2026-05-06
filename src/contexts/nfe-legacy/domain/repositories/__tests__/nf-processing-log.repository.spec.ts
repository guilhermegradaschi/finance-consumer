import { DataSource } from 'typeorm';
import { NfProcessingLogRepository } from '@context/nfe-legacy/domain/repositories/nf-processing-log.repository';

describe('NfProcessingLogRepository', () => {
  let repository: NfProcessingLogRepository;
  let querySpy: jest.SpyInstance;

  beforeEach(() => {
    const mockEntityManager = { getRepository: jest.fn() };
    const mockDataSource = {
      createEntityManager: jest.fn().mockReturnValue(mockEntityManager),
    } as unknown as DataSource;

    repository = new NfProcessingLogRepository(mockDataSource);
    querySpy = jest.spyOn(repository, 'query').mockImplementation(jest.fn());
  });

  describe('findFailedNfs — enriched audit summary', () => {
    it('should expose enriched fields for a multi-RECEIVE scenario (SUCCESS then DUPLICATE)', async () => {
      const rawRow = {
        chaveAcesso: '35240112345678000195550010000001231234567890',
        lastStage: 'RECEIVE',
        lastStatus: 'DUPLICATE',
        errorCode: null,
        errorMessage: null,
        source: 'EMAIL',
        firstReceiveAt: new Date('2026-01-01T10:00:00Z'),
        lastEventAt: new Date('2026-01-02T10:00:00Z'),
        attemptCount: '3',
        everReceivedSuccessfully: 't',
        lastReceiveOutcome: 'DUPLICATE',
        currentPipelineStatus: 'COMPLETED',
        hasNotaFiscal: 't',
        notaFiscalStatus: 'COMPLETED',
        notaFiscalCreatedAt: new Date('2026-01-01T10:05:00Z'),
        notaFiscalProcessedAt: new Date('2026-01-01T10:10:00Z'),
      };

      querySpy.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([rawRow]);

      const result = await repository.findFailedNfs({});

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);

      const item = result.data[0];
      expect(item.everReceivedSuccessfully).toBe(true);
      expect(item.lastReceiveOutcome).toBe('DUPLICATE');
      expect(item.hasNotaFiscal).toBe(true);
      expect(item.attemptCount).toBe(3);
      expect(item.currentPipelineStatus).toBe('COMPLETED');
      expect(item.notaFiscalStatus).toBe('COMPLETED');
      expect(item.firstReceiveAt).toEqual(new Date('2026-01-01T10:00:00Z'));
      expect(item.lastEventAt).toEqual(new Date('2026-01-02T10:00:00Z'));
    });

    it('should coerce everReceivedSuccessfully=false when no RECEIVE+SUCCESS exists', async () => {
      const rawRow = {
        chaveAcesso: 'abc',
        lastStage: 'RECEIVE',
        lastStatus: 'REJECTED',
        errorCode: 'NF003',
        errorMessage: 'Invalid chave',
        source: 'API',
        firstReceiveAt: new Date(),
        lastEventAt: new Date(),
        attemptCount: '1',
        everReceivedSuccessfully: false,
        lastReceiveOutcome: 'REJECTED',
        currentPipelineStatus: 'RECEIVE:REJECTED',
        hasNotaFiscal: false,
        notaFiscalStatus: null,
        notaFiscalCreatedAt: null,
        notaFiscalProcessedAt: null,
      };

      querySpy.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([rawRow]);

      const result = await repository.findFailedNfs({});
      const item = result.data[0];
      expect(item.everReceivedSuccessfully).toBe(false);
      expect(item.hasNotaFiscal).toBe(false);
      expect(item.lastReceiveOutcome).toBe('REJECTED');
      expect(item.currentPipelineStatus).toBe('RECEIVE:REJECTED');
    });

    it('should use matching_chaves CTE when filters are provided (any-match semantics)', async () => {
      querySpy.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([
        {
          chaveAcesso: 'abc',
          lastStage: 'PERSIST',
          lastStatus: 'SUCCESS',
          errorCode: null,
          errorMessage: null,
          source: 'API',
          firstReceiveAt: new Date(),
          lastEventAt: new Date(),
          attemptCount: '2',
          everReceivedSuccessfully: true,
          lastReceiveOutcome: 'SUCCESS',
          currentPipelineStatus: 'PERSISTED',
          hasNotaFiscal: true,
          notaFiscalStatus: 'PERSISTED',
          notaFiscalCreatedAt: new Date(),
          notaFiscalProcessedAt: new Date(),
        },
      ]);

      await repository.findFailedNfs({ status: 'DUPLICATE' });

      const countSql = querySpy.mock.calls[0][0] as string;
      expect(countSql).toContain('matching_chaves');
      expect(countSql).toContain('SELECT DISTINCT chave_acesso');

      const countParams = querySpy.mock.calls[0][1] as unknown[];
      expect(countParams).toContain('DUPLICATE');
    });

    it('should NOT use matching_chaves CTE when no filters are provided', async () => {
      querySpy.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);

      await repository.findFailedNfs({});

      const countSql = querySpy.mock.calls[0][0] as string;
      expect(countSql).not.toContain('matching_chaves');
    });

    it('should apply pagination correctly', async () => {
      querySpy.mockResolvedValueOnce([{ total: '50' }]).mockResolvedValueOnce([]);

      await repository.findFailedNfs({ page: 3, limit: 10 });

      const dataSql = querySpy.mock.calls[1][0] as string;
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).toContain('OFFSET');

      const dataParams = querySpy.mock.calls[1][1] as unknown[];
      expect(dataParams).toContain(10);
      expect(dataParams).toContain(20);
    });
  });

  describe('findAuditEvents — flat event list', () => {
    it('should return individual processing log rows', async () => {
      const rawEvent = {
        id: 'uuid-1',
        notaFiscalId: null,
        chaveAcesso: '35240112345678000195550010000001231234567890',
        stage: 'RECEIVE',
        status: 'SUCCESS',
        source: 'API',
        errorCode: null,
        errorMessage: null,
        durationMs: 42,
        attemptNumber: 1,
        traceId: 'trace-1',
        metadata: {},
        createdAt: new Date('2026-01-01T10:00:00Z'),
      };

      querySpy.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([rawEvent]);

      const result = await repository.findAuditEvents({ page: 1, limit: 50 });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].stage).toBe('RECEIVE');
      expect(result.data[0].status).toBe('SUCCESS');
      expect(result.data[0].chaveAcesso).toBe('35240112345678000195550010000001231234567890');
    });

    it('should apply chaveAcesso and date range filters', async () => {
      querySpy.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);

      await repository.findAuditEvents({
        chaveAcesso: 'abc',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      });

      const countSql = querySpy.mock.calls[0][0] as string;
      expect(countSql).toContain('chave_acesso = $');
      expect(countSql).toContain('created_at >= $');
      expect(countSql).toContain('created_at <= $');

      const countParams = querySpy.mock.calls[0][1] as unknown[];
      expect(countParams).toEqual(['abc', '2026-01-01', '2026-12-31']);
    });

    it('should apply stage, status, and source filters', async () => {
      querySpy.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);

      await repository.findAuditEvents({
        stage: 'RECEIVE',
        status: 'DUPLICATE',
        source: 'EMAIL' as any,
      });

      const countSql = querySpy.mock.calls[0][0] as string;
      expect(countSql).toContain('stage = $');
      expect(countSql).toContain('status = $');
      expect(countSql).toContain('source = $');
    });

    it('should paginate events correctly', async () => {
      querySpy.mockResolvedValueOnce([{ total: '200' }]).mockResolvedValueOnce([]);

      await repository.findAuditEvents({ page: 2, limit: 25 });

      const dataParams = querySpy.mock.calls[1][1] as unknown[];
      expect(dataParams).toContain(25);
      expect(dataParams).toContain(25);
    });
  });
});
