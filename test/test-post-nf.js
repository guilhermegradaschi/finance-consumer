#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ENDPOINT = `${BASE_URL}/api/v1/nf`;

const xmlFile = process.argv[2];
if (!xmlFile) {
  console.error('Usage: node test/test-post-nf.js <path-to-xml-file>');
  console.error('Example: node test/test-post-nf.js test/fixtures/xml_example.xml');
  process.exit(1);
}

const xmlPath = path.resolve(xmlFile);
if (!fs.existsSync(xmlPath)) {
  console.error(`File not found: ${xmlPath}`);
  process.exit(1);
}

async function main() {
  const xmlContent = fs.readFileSync(xmlPath, 'utf8');
  const token = jwt.sign({ sub: 'test-user' }, JWT_SECRET, { expiresIn: '1h' });

  console.log(`Sending XML: ${xmlFile}`);
  console.log(`Endpoint:    ${ENDPOINT}`);
  console.log(`XML size:    ${xmlContent.length} chars`);
  console.log('---');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      xmlContent,
      source: 'API',
      metadata: { uploadedBy: 'test-script', file: path.basename(xmlFile) },
    }),
  });

  const data = await response.json();

  console.log(`Status:      ${response.status}`);
  console.log('Response:');
  console.log(JSON.stringify(data, null, 2));

  process.exit(response.ok || response.status === 202 ? 0 : 1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
