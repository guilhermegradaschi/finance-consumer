import {
  buildNfeConsultaProtocoloEnvelope,
  extractSoapTag,
  isNfeAutorizadaUso,
  parseConsultaSitNfeResponse,
} from '@context/nfe-legacy/infrastructure/sefaz/sefaz-soap.util';

describe('sefaz-soap.util', () => {
  it('buildNfeConsultaProtocoloEnvelope includes chave and tpAmb', () => {
    const xml = buildNfeConsultaProtocoloEnvelope('35240112345678000195550010000001231234567891', '2');
    expect(xml).toContain('35240112345678000195550010000001231234567891');
    expect(xml).toContain('<tpAmb>2</tpAmb>');
    expect(xml).toContain('consSitNFe');
  });

  it('parseConsultaSitNfeResponse reads cStat and xMotivo', () => {
    const sample = '<root><cStat>100</cStat><xMotivo>Autorizado</xMotivo></root>';
    expect(parseConsultaSitNfeResponse(sample)).toEqual({ cStat: '100', xMotivo: 'Autorizado' });
  });

  it('extractSoapTag returns inner text', () => {
    expect(extractSoapTag('<cStat>101</cStat>', 'cStat')).toBe('101');
  });

  it('isNfeAutorizadaUso is true only for 100', () => {
    expect(isNfeAutorizadaUso('100')).toBe(true);
    expect(isNfeAutorizadaUso('101')).toBe(false);
    expect(isNfeAutorizadaUso(null)).toBe(false);
  });
});
