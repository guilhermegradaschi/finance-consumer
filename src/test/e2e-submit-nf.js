const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const XML_PATH = process.argv[2] || 'src/test/fixtures/xml_example.xml';

const token = jwt.sign({ sub: 'test-user', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

const xmlContent = fs.readFileSync(XML_PATH, 'utf8');
console.log(`XML loaded: ${XML_PATH} (${xmlContent.length} bytes)`);

const body = JSON.stringify({ xmlContent, source: 'API' });
console.log(`JSON body size: ${body.length} bytes`);

const url = new URL('/api/v1/nf', BASE_URL);

const req = http.request(
  {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization: `Bearer ${token}`,
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log(`\nStatus: ${res.statusCode}`);
      try {
        console.log('Response:', JSON.stringify(JSON.parse(data), null, 2));
      } catch {
        console.log('Response:', data);
      }
    });
  },
);

req.on('error', (err) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
