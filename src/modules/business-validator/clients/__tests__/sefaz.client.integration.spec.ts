import { SefazClient } from '../sefaz.client';

const run = process.env.SEFAZ_INTEGRATION_TEST === '1';

(run ? describe : describe.skip)('SefazClient integration (SEFAZ_INTEGRATION_TEST=1)', () => {
  it('requires real env — placeholder for homologation SOAP calls', () => {
    expect(SefazClient).toBeDefined();
  });
});
