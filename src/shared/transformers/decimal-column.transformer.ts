import Decimal from 'decimal.js';

export function toDecimalValue(value: unknown, defaultStr = '0'): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(defaultStr);
  }
  if (value instanceof Decimal) {
    return value;
  }
  if (typeof value === 'string') {
    return new Decimal(value);
  }
  if (typeof value === 'number') {
    return new Decimal(value);
  }
  return new Decimal(String(value));
}

export const decimalColumnTransformer = {
  to(value: Decimal | number | string | null | undefined): string {
    if (value === null || value === undefined) {
      return '0';
    }
    const d = value instanceof Decimal ? value : new Decimal(value);
    return d.toString();
  },
  from(value: string | null): Decimal {
    if (value === null || value === undefined || value === '') {
      return new Decimal(0);
    }
    return new Decimal(value);
  },
};

export const decimalColumnNullableTransformer = {
  to(value: Decimal | number | string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const d = value instanceof Decimal ? value : new Decimal(value);
    return d.toString();
  },
  from(value: string | null): Decimal | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return new Decimal(value);
  },
};
