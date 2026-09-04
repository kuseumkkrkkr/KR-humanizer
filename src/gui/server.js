import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { analyzeText, sanitizeText } from '../core/analyze.js';
import { applyProposal, buildProposal } from '../core/diff.js';
import { rewriteWithEngine } from '../engines/runner.js';
import { createMemoryStore } from '../memory/index.js';

const MAX_BODY = 1024 * 1024;
const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8']
};

async function readBody(request) {
  let body = '';
  let bytes = 0;
  request.setEncoding('utf8');
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_BODY) throw Object.assign(new Error('요청이 너무 큽니다.'), { status: 413 });
    body += chunk;
  }
  return JSON.parse(body || '{}');
}

function send(response, status, value, type = 'application/json; charset=utf-8') {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  response.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
  response.end(body);
}

function openBrowser(url) {
  const commands = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(commands[0], commands[1], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

export async function startGui({ port = 4317, open = true } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('port는 1024~65535 정수여야 합니다.');
  const token = randomBytes(24).toString('hex');
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && assets[url.pathname]) {
        const [name, type] = assets[url.pathname];
        let content = await readFile(new URL(name, import.meta.url), 'utf8');
        if (name === 'index.html') content = content.replace('__SESSION_TOKEN__', token);
        return send(response, 200, content, type);
      }
      if (request.method !== 'POST' || request.headers['x-kr-humanizer-token'] !== token) return send(response, 403, { error: '허용되지 않은 요청입니다.' });
      const body = await readBody(request);
      if (url.pathname === '/api/analyze') return send(response, 200, analyzeText(body.text ?? ''));
      if (url.pathname === '/api/sanitize') return send(response, 200, sanitizeText(body.text ?? ''));
      if (url.pathname === '/api/accept') return send(response, 200, { text: applyProposal(body.proposal, body.acceptedIds ?? []) });
      if (url.pathname === '/api/rewrite') {
        const store = createMemoryStore({ provider: body.memory === 'mem0' ? 'mem0' : 'local', baseUrl: body.mem0Url, userId: body.userId ?? 'default' });
        const memories = (await store.search((body.text ?? '').slice(0, 500), 6)).map((item) => item.text);
        const rewritten = await rewriteWithEngine({ engine: body.engine ?? 'codex', text: body.text ?? '', tone: body.tone, memories });
        const proposal = { ...buildProposal(body.text ?? '', rewritten.rewrittenText), summary: rewritten.summary, flow: { nodes: rewritten.flow, edges: rewritten.edges } };
        return send(response, 200, proposal);
      }
      if (url.pathname === '/api/remember') {
        const store = createMemoryStore({ provider: body.memory === 'mem0' ? 'mem0' : 'local', baseUrl: body.mem0Url, userId: body.userId ?? 'default' });
        await store.add(body.text ?? '', { acceptedIds: body.acceptedIds ?? [] });
        return send(response, 200, { ok: true });
      }
      return send(response, 404, { error: '찾을 수 없습니다.' });
    } catch (error) {
      return send(response, error.status ?? 500, { error: error.message });
    }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${port}`;
  process.stdout.write(`KR-humanizer GUI: ${url}\n종료: Ctrl+C\n`);
  if (open) openBrowser(url);
  return server;
}
