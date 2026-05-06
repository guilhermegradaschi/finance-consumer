import { extractChaveAcessoFromXml, isValidChaveAcesso, extractXmlTag } from '@shared/utils/xml.util';

describe('xml.util', () => {
  describe('extractChaveAcessoFromXml', () => {
    it('should extract chaveAcesso from valid NF-e XML', () => {
      const xml = '<infNFe Id="NFe35240112345678000195550010000001231234567890" versao="4.00">';
      const result = extractChaveAcessoFromXml(xml);
      expect(result).toBe('35240112345678000195550010000001231234567890');
    });

    it('should return null for invalid XML without chaveAcesso', () => {
      const xml = '<invalid/>';
      expect(extractChaveAcessoFromXml(xml)).toBeNull();
    });

    it('should return null for empty XML', () => {
      expect(extractChaveAcessoFromXml('')).toBeNull();
    });

    it('should extract only the 44-digit numeric chave', () => {
      const xml = 'prefix Id="NFe12345678901234567890123456789012345678901234" suffix';
      const result = extractChaveAcessoFromXml(xml);
      expect(result).toBe('12345678901234567890123456789012345678901234');
      expect(result).toHaveLength(44);
    });

    it('should extract chaveAcesso from <chNFe> tag', () => {
      const xml = '<protNFe><infProt><chNFe>35260328189078000115550010011243241110120258</chNFe></infProt></protNFe>';
      const result = extractChaveAcessoFromXml(xml);
      expect(result).toBe('35260328189078000115550010011243241110120258');
    });

    it('should extract chaveAcesso from escaped quotes', () => {
      const xml = 'Id=\\"NFe35240112345678000195550010000001231234567890\\"';
      const result = extractChaveAcessoFromXml(xml);
      expect(result).toBe('35240112345678000195550010000001231234567890');
    });

    it('should extract chaveAcesso from single-line real NF-e XML', () => {
      const xml =
        '<?xml version="1.0" encoding="UTF-8" ?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe35260328189078000115550010011243241110120258" versao="4.00"><ide><cUF>35</cUF></ide></infNFe></NFe></nfeProc>';
      const result = extractChaveAcessoFromXml(xml);
      expect(result).toBe('35260328189078000115550010011243241110120258');
    });
  });

  describe('isValidChaveAcesso', () => {
    it('should return true for a valid 44-digit chave', () => {
      expect(isValidChaveAcesso('35240112345678000195550010000001231234567890')).toBe(true);
    });

    it('should return false for a short string', () => {
      expect(isValidChaveAcesso('123')).toBe(false);
    });

    it('should return false for a non-numeric 44-char string', () => {
      expect(isValidChaveAcesso('3524011234567800019555001000000123123456789a')).toBe(false);
    });
  });

  describe('extractXmlTag', () => {
    it('should extract the content of a simple tag', () => {
      const xml = '<nNF>123</nNF>';
      expect(extractXmlTag(xml, 'nNF')).toBe('123');
    });

    it('should return null when tag does not exist', () => {
      expect(extractXmlTag('<a>b</a>', 'c')).toBeNull();
    });
  });
});
