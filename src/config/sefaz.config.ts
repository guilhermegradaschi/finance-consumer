import { registerAs } from '@nestjs/config';

export default registerAs('sefaz', () => {
  const amb = process.env.SEFAZ_TP_AMB === '1' ? '1' : '2';
  return {
    mockEnabled: process.env.SEFAZ_MOCK_ENABLED !== 'false',
    webserviceUrl: process.env.SEFAZ_WEBSERVICE_URL ?? '',
    certPath: process.env.SEFAZ_CERT_PATH ?? '',
    certPassword: process.env.SEFAZ_CERT_PASSWORD ?? '',
    tpAmb: amb,
    requestTimeoutMs: parseInt(process.env.SEFAZ_REQUEST_TIMEOUT_MS ?? '20000', 10),
  };
});
