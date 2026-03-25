import { MetricsService } from '../metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('should increment counters', () => {
    service.incrementCounter('test.counter', {});
    service.incrementCounter('test.counter', {});

    expect(service.getCounter('test.counter')).toBe(2);
  });

  it('should increment counters with labels', () => {
    service.incrementCounter('test.counter', { stage: 'receive' });
    service.incrementCounter('test.counter', { stage: 'process' });

    expect(service.getCounter('test.counter', { stage: 'receive' })).toBe(1);
    expect(service.getCounter('test.counter', { stage: 'process' })).toBe(1);
  });

  it('should record histogram values', () => {
    service.recordHistogram('test.duration', 100, { stage: 'xml' });
    service.recordHistogram('test.duration', 200, { stage: 'xml' });

    const values = service.getHistogram('test.duration', { stage: 'xml' });
    expect(values).toEqual([100, 200]);
  });

  it('should track NF-specific metrics', () => {
    service.nfReceived('API');
    service.nfReceived('API');
    service.nfReceived('EMAIL');
    service.nfProcessed();
    service.nfError('xml');

    expect(service.getCounter('nf.received.total', { source: 'API' })).toBe(2);
    expect(service.getCounter('nf.received.total', { source: 'EMAIL' })).toBe(1);
    expect(service.getCounter('nf.processed.total')).toBe(1);
    expect(service.getCounter('nf.error.total', { stage: 'xml' })).toBe(1);
  });

  it('should return all metrics', () => {
    service.nfReceived('API');
    service.recordProcessingDuration('xml', 150);

    const all = service.getAllMetrics();
    expect(all.counters.length).toBe(1);
    expect(all.histograms.length).toBe(1);
  });

  it('should return 0 for non-existing counter', () => {
    expect(service.getCounter('nonexistent')).toBe(0);
  });

  it('should return empty array for non-existing histogram', () => {
    expect(service.getHistogram('nonexistent')).toEqual([]);
  });
});
