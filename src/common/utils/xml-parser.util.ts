import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  preserveOrder: false,
  trimValues: true,
});

export function parseXmlToHash(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function extractInfNfe(hash: Record<string, unknown>): Record<string, unknown> | null {
  const paths = [
    'nfeProc.NFe.infNFe',
    'enviNFe.NFe.infNFe',
    'NFe.infNFe',
  ];

  for (const path of paths) {
    const result = getNestedValue(hash, path);
    if (result) {
      if (Array.isArray(result)) {
        return result[0] as Record<string, unknown>;
      }
      return result as Record<string, unknown>;
    }
  }

  return null;
}

export function safeGet(obj: unknown, path: string): unknown {
  return getNestedValue(obj, path) ?? null;
}

export function safeGetString(obj: unknown, path: string): string | null {
  const val = getNestedValue(obj, path);
  if (val === null || val === undefined) return null;
  return String(val);
}

export function safeGetNumber(obj: unknown, path: string): number {
  const val = getNestedValue(obj, path);
  if (val === null || val === undefined) return 0;
  const num = parseFloat(String(val));
  return isNaN(num) ? 0 : num;
}

export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}
