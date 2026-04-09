import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

const storage = new AsyncLocalStorage<{ correlationId: string }>();

export const CORRELATION_HEADER = 'x-correlation-id';

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function runWithCorrelationId<T>(correlationId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ correlationId }, fn);
}

export function enterCorrelationContext<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function createCorrelationId(): string {
  return randomUUID();
}
