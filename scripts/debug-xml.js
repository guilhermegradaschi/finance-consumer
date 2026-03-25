const fs = require('fs');
const xml = fs.readFileSync('test/fixtures/valid-nfe.xml', 'utf-8');

const CHAVE_REGEX = /Id="NFe(\d{44})"/;
console.log('Direct extraction:', CHAVE_REGEX.exec(xml)?.[1] ?? 'NO MATCH');

// Simulate what PowerShell ConvertTo-Json does
const psJson = JSON.stringify({ xmlContent: xml, source: 'API' });
console.log('JSON body length:', psJson.length);

const parsed = JSON.parse(psJson);
console.log('After JSON round-trip:', CHAVE_REGEX.exec(parsed.xmlContent)?.[1] ?? 'NO MATCH');

// Check for BOM
const rawBytes = fs.readFileSync('test/fixtures/valid-nfe.xml');
console.log('First 3 bytes (BOM check):', rawBytes[0], rawBytes[1], rawBytes[2]);
console.log('Has BOM:', rawBytes[0] === 0xEF && rawBytes[1] === 0xBB && rawBytes[2] === 0xBF);

// Try hitting the actual server
const http = require('http');
const jwt = require('jsonwebtoken');
const token = jwt.sign({ sub: 'test-user', role: 'admin' }, 'dev-secret-key-change-in-production', { expiresIn: '1h' });

const body = JSON.stringify({ xmlContent: xml, source: 'API' });
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/nf',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('\nServer response status:', res.statusCode);
    console.log('Server response:', JSON.parse(data));
  });
});

req.write(body);
req.end();
