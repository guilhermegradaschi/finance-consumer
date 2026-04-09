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

  getRegistry(): { contentType: string } {
    return { contentType: 'text/plain; version=0.0.4; charset=utf-8' };
  }

  async getPrometheusText(): Promise<string> {
    const lines: string[] = [];
    for (const c of this.counters.values()) {
      const name = this.toPrometheusName(c.name);
      lines.push(`# HELP ${name} ${c.name}`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${this.formatPrometheusLabels(c.labels)} ${c.value}`);
    }
    for (const h of this.histograms.values()) {
      const sum = h.values.reduce((a, b) => a + b, 0);
      const count = h.values.length;
      const base = this.toPrometheusName(h.name);
      lines.push(`# HELP ${base} ${h.name}`);
      lines.push(`# TYPE ${base} untyped`);
      lines.push(`${base}_sum${this.formatPrometheusLabels(h.labels)} ${sum}`);
      lines.push(`${base}_count${this.formatPrometheusLabels(h.labels)} ${count}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private toPrometheusName(name: string): string {
    return name.replace(/\./g, '_');
  }

  private formatPrometheusLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) {
      return '';
    }
    const inner = entries.map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
    return `{${inner}}`;
  }
}
