import { isValidCnpj, isValidCpf, isValidIe, isValidNfeChaveAcesso } from '@shared/validation/br-tax-id.util';

describe('br-tax-id.util', () => {
  describe('isValidNfeChaveAcesso', () => {
    it('should accept chave with correct check digit', () => {
      expect(isValidNfeChaveAcesso('35240112345678000195550010000001231234567891')).toBe(true);
      expect(isValidNfeChaveAcesso('35260328189078000115550010011243241110120258')).toBe(true);
    });

    it('should reject wrong length or bad DV', () => {
      expect(isValidNfeChaveAcesso('35240112345678000195550010000001231234567890')).toBe(false);
      expect(isValidNfeChaveAcesso('123')).toBe(false);
    });
  });

  describe('isValidCnpj', () => {
    it('should validate known good CNPJ', () => {
      expect(isValidCnpj('12345678000195')).toBe(true);
      expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    });

    it('should reject invalid CNPJ', () => {
      expect(isValidCnpj('12345678000194')).toBe(false);
      expect(isValidCnpj('11111111111111')).toBe(false);
    });
  });

  describe('isValidCpf', () => {
    it('should validate known good CPF', () => {
      expect(isValidCpf('390.533.447-05')).toBe(true);
    });

    it('should reject invalid CPF', () => {
      expect(isValidCpf('11111111111')).toBe(false);
    });
  });

  describe('isValidIe', () => {
    it('should validate SP IE length pattern', () => {
      expect(isValidIe('118000000119', 'SP')).toBe(true);
    });

    it('should reject empty', () => {
      expect(isValidIe('', 'SP')).toBe(false);
    });
  });
});
