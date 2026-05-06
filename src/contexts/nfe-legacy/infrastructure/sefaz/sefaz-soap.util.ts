const SOAP_NS = 'http://www.w3.org/2003/05/soap-envelope';
const WSDL_NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4';
const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';

export function buildNfeConsultaProtocoloEnvelope(chaveAcesso: string, tpAmb: '1' | '2'): string {
  const inner = `<consSitNFe xmlns="${NFE_NS}" versao="4.00"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chaveAcesso}</chNFe></consSitNFe>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="${SOAP_NS}">
<soap12:Body>
<nfeConsultaNF xmlns="${WSDL_NS}">
<nfeDadosMsg>${inner}</nfeDadosMsg>
</nfeConsultaNF>
</soap12:Body>
</soap12:Envelope>`;
}

export function extractSoapTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

export function parseConsultaSitNfeResponse(responseXml: string): {
  cStat: string | null;
  xMotivo: string | null;
} {
  return {
    cStat: extractSoapTag(responseXml, 'cStat'),
    xMotivo: extractSoapTag(responseXml, 'xMotivo'),
  };
}

export function isNfeAutorizadaUso(cStat: string | null): boolean {
  return cStat === '100';
}
