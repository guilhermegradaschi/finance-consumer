import { CircuitBreakerFactory } from '@infra/http/circuit-breaker.factory';

describe('CircuitBreakerFactory', () => {
  it('should create a breaker with the given name and run the action on fire', async () => {
    const factory = new CircuitBreakerFactory();
    const action = jest.fn().mockResolvedValue(42);
    const breaker = factory.create('test-op', action, { volumeThreshold: 1 });
    const result = await breaker.fire('x');
    expect(result).toBe(42);
    expect(action).toHaveBeenCalledWith('x');
    expect(breaker.name).toBe('test-op');
  });
});
