import { Injectable } from '@nestjs/common';
import CircuitBreaker = require('opossum');

const DEFAULT_OPTIONS: Partial<CircuitBreaker.Options> = {
  timeout: 15000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

@Injectable()
export class CircuitBreakerFactory {
  create<T extends unknown[], R>(
    name: string,
    action: (...args: T) => Promise<R>,
    overrides?: Partial<CircuitBreaker.Options>,
  ): CircuitBreaker<T, R> {
    return new CircuitBreaker(action, {
      ...DEFAULT_OPTIONS,
      ...overrides,
      name,
    });
  }
}
