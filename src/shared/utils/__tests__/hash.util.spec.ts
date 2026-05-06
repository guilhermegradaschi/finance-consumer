import { generateHash, generateIdempotencyKey } from '@shared/utils/hash.util';

describe('hash.util', () => {
  describe('generateHash', () => {
    it('should return a deterministic SHA-256 hex string of 64 characters', () => {
      const input = '35240112345678000195550010000001231234567890';
      const result = generateHash(input);

      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return the same hash for the same input', () => {
      const input = 'test-content';
      expect(generateHash(input)).toBe(generateHash(input));
    });

    it('should return different hashes for different inputs', () => {
      expect(generateHash('abc')).not.toBe(generateHash('def'));
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate key from chaveAcesso and source', () => {
      const key = generateIdempotencyKey('12345678901234567890123456789012345678901234', 'API');
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different keys for different sources', () => {
      const chave = '12345678901234567890123456789012345678901234';
      const keyApi = generateIdempotencyKey(chave, 'API');
      const keyEmail = generateIdempotencyKey(chave, 'EMAIL');
      expect(keyApi).not.toBe(keyEmail);
    });
  });
});
