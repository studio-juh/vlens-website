import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {startServer} from './serve.mjs';
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML ids');
for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(anchor), 'Missing anchor: ' + anchor);
for (const [, asset] of html.matchAll(/(?:href|src)="\.\/([^"]+)"/g)) await access(new URL('../dist/' + asset, import.meta.url));
assert(!html.includes('github.com/studio-juh/AvatarCam'), 'Do not link visitors to the private app repository');
assert(!html.includes('getUserMedia'), 'The website must not request camera/microphone access');
const server = await startServer(0);
try {
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const asset of ['/', '/style.css', '/favicon.svg', '/screenshots/output-monitor.jpg', '/screenshots/psd-editor.jpg']) {
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200, asset);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    if (asset.endsWith('.jpg')) assert.equal(response.headers.get('content-type'), 'image/jpeg');
  }
  assert.equal((await fetch(origin + '/missing')).status, 404);
  console.log('PASS: internal anchors, local assets, public links, preview HTTP responses.');
} finally { server.close(); }

