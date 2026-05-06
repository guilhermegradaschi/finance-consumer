import { XMLParser } from 'fast-xml-parser';

const CHAVE_ACESSO_PATTERNS = [
  /Id="NFe(\d{44})"/,
  /Id='NFe(\d{44})'/,
  /Id=\\?"NFe(\d{44})\\?"/,
  /<chNFe>(\d{44})<\/chNFe>/,
  /NFe(\d{44})/,
];

export function extractChaveAcessoFromXml(xml: string): string | null {
  for (const regex of CHAVE_ACESSO_PATTERNS) {
    const match = regex.exec(xml);
    if (match) return match[1];
  }
  return null;
}

export function isValidChaveAcesso(chaveAcesso: string): boolean {
  return /^\d{44}$/.test(chaveAcesso);
}

export function extractXmlTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`);
  const match = regex.exec(xml);
  return match ? match[1] : null;
}

const wellFormedParser = new XMLParser({
  allowBooleanAttributes: true,
  ignoreDeclaration: false,
  parseTagValue: false,
  trimValues: false,
  processEntities: false,
});

export function assertXmlWellFormed(xml: string): void {
  if (xml == null || typeof xml !== 'string' || !xml.trim()) {
    throw new Error('XML payload is empty');
  }
  try {
    wellFormedParser.parse(xml);
  } catch (e) {
    throw new Error(`XML_MALFORMED: ${(e as Error).message}`);
  }
}
