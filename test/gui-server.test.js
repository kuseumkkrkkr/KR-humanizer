import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { startGui } from '../src/gui/server.js';

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('GUI enforces byte-sized request limit and security headers', async () => {
  const port = await freePort();
  const server = await startGui({ port, open: false });
  try {
    const root = await fetch(`http://127.0.0.1:${port}/`);
    const html = await root.text();
    const token = html.match(/name="kr-humanizer-token" content="([a-f0-9]+)"/)?.[1];
    assert.ok(token);
    assert.match(root.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(root.headers.get('x-content-type-options'), 'nosniff');

    const response = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kr-humanizer-token': token },
      body: JSON.stringify({ text: '가'.repeat(400_000) })
    });
    assert.equal(response.status, 413);

    const missingBrief = await fetch(`http://127.0.0.1:${port}/api/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kr-humanizer-token': token },
      body: JSON.stringify({ brief: '' })
    });
    assert.equal(missingBrief.status, 400);
    assert.match((await missingBrief.json()).error, /프롬프트가 필요/);

    const longBrief = await fetch(`http://127.0.0.1:${port}/api/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kr-humanizer-token': token },
      body: JSON.stringify({ brief: '가'.repeat(4_001) })
    });
    assert.equal(longBrief.status, 400);

    const shortCompletion = await fetch(`http://127.0.0.1:${port}/api/autocomplete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kr-humanizer-token': token },
      body: JSON.stringify({ text: '짧은 글' })
    });
    assert.equal(shortCompletion.status, 400);
    assert.match((await shortCompletion.json()).error, /20자 이상/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
