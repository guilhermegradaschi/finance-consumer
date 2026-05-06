import { createRequire } from 'module';
import type { Document } from 'libxmljs2';

export type LibXmlJs2 = {
  parseXml: (xml: string, options?: Record<string, unknown>) => Document;
};

const requireModule = createRequire(__filename);

export function tryLoadLibxmljs2(): LibXmlJs2 | null {
  try {
    return requireModule('libxmljs2') as LibXmlJs2;
  } catch {
    return null;
  }
}
