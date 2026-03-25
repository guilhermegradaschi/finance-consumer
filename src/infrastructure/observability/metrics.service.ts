import { Injectable, Logger } from '@nestjs/common';

interface CounterEntry {
  name: string;
  value: number;
  labels: Record<string, string>;
}

interface HistogramEntry {
  name: string;
  values: number[];
  labels: Record<string, string>;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private counters = new Map<string, CounterEntry>();
  private histograms = new Map<string, HistogramEntry>();

  incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, { name, value, labels });
    }
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const existing = this.histograms.get(key);

    if (existing) {
      existing.values.push(value);
    } else {
      this.histograms.set(key, { name, values: [value], labels });
    }
  }

  getCounter(name: string, labels: Record<string, string> = {}): number {
    const key = `${name}:${JSON.stringify(labels)}`;
    return this.counters.get(key)?.value ?? 0;
  }

  getHistogram(name: string, labels: Record<string, string> = {}): number[] {
    const key = `${name}:${JSON.stringify(labels)}`;
    return this.histograms.get(key)?.values ?? [];
  }

  getAllMetrics(): { counters: CounterEntry[]; histograms: HistogramEntry[] } {
    return {
      counters: Array.from(this.counters.values()),
      histograms: Array.from(this.histograms.values()),
    };
  }

  nfReceived(source: string): void {
    this.incrementCounter('nf.received.total', { source });
  }

  nfProcessed(): void {
    this.incrementCounter('nf.processed.total');
  }

  nfValidated(): void {
    this.incrementCounter('nf.validated.total');
  }

  nfPersisted(): void {
    this.incrementCounter('nf.persisted.total');
  }

  nfError(stage: string): void {
    this.incrementCounter('nf.error.total', { stage });
  }

  nfRetry(stage: string): void {
    this.incrementCounter('nf.retry.total', { stage });
  }

  nfDlq(stage: string): void {
    this.incrementCounter('nf.dlq.total', { stage });
  }

  recordProcessingDuration(stage: string, durationMs: number): void {
    this.recordHistogram('nf.processing.duration_ms', durationMs, { stage });
  }
}
