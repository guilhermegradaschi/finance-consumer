import Decimal from 'decimal.js';
import {
  decimalColumnTransformer,
  decimalColumnNullableTransformer,
  toDecimalValue,
} from '@shared/transformers/decimal-column.transformer';

describe('decimalColumnTransformer', () => {
  it('should round-trip Decimal through to and from', () => {
    const d = new Decimal('12345678901234.5678');
    const stored = decimalColumnTransformer.to(d);
    expect(stored).toBe('12345678901234.5678');
    expect(decimalColumnTransformer.from(stored).toString()).toBe('12345678901234.5678');
  });

  it('should map empty from value to zero', () => {
    expect(decimalColumnTransformer.from('').toString()).toBe('0');
  });
});

describe('decimalColumnNullableTransformer', () => {
  it('should map null to and from', () => {
    expect(decimalColumnNullableTransformer.to(null)).toBeNull();
    expect(decimalColumnNullableTransformer.from(null)).toBeNull();
  });
});

describe('toDecimalValue', () => {
  it('should coerce number and string safely', () => {
    expect(toDecimalValue('10.25').toString()).toBe('10.25');
    expect(toDecimalValue(10).toString()).toBe('10');
  });

  it('should use default for nullish', () => {
    expect(toDecimalValue(null).toString()).toBe('0');
    expect(toDecimalValue(undefined, '1').toString()).toBe('1');
  });
});
