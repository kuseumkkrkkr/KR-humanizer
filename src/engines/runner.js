import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildRewritePrompt } from '../core/prompt.js';

const schemaPath = fileURLToPath(new URL('../../schemas/rewrite.schema.json', import.meta.url));
const MAX_OUTPUT = 2 * 1024 * 1024;

function run(command, args, input, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT) child.kill();
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`${command} 실행 실패: ${error.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stdout.length > MAX_OUTPUT) return reject(new Error(`${command} output exceeded ${MAX_OUTPUT} bytes`));
      if (code !== 0) return reject(new Error(`${command} exited with ${code}: ${stderr.trim().slice(-1200)}`));
      resolve({ stdout, stderr });
    });
    child.stdin.end(input, 'utf8');
  });
}

function assertResult(value) {
  if (!value || typeof value.rewrittenText !== 'string' || !Array.isArray(value.flow) || !Array.isArray(value.edges)) {
    throw new Error('엔진이 예상한 윤문 JSON을 반환하지 않았습니다.');
  }
  return value;
}

function parseClaude(stdout) {
  const outer = JSON.parse(stdout);
  if (outer.structured_output) return assertResult(outer.structured_output);
  if (typeof outer.result === 'string') return assertResult(JSON.parse(outer.result));
  return assertResult(outer);
}

export async function rewriteWithEngine({ engine = 'codex', text, tone, memories = [], timeoutMs }) {
  const prompt = buildRewritePrompt({ text, tone, memories });
  if (engine === 'codex') {
    const outputPath = join(tmpdir(), `kr-humanizer-${randomUUID()}.json`);
    try {
      await run('codex', ['exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--output-schema', schemaPath, '--output-last-message', outputPath, '-'], prompt, timeoutMs);
      return assertResult(JSON.parse(await readFile(outputPath, 'utf8')));
    } finally {
      await unlink(outputPath).catch(() => {});
    }
  }
  if (engine === 'claude') {
    const schema = await readFile(schemaPath, 'utf8');
    const { stdout } = await run('claude', ['-p', '--output-format', 'json', '--json-schema', schema, '--permission-mode', 'plan', '--no-session-persistence'], prompt, timeoutMs);
    return parseClaude(stdout);
  }
  throw new Error(`지원하지 않는 엔진: ${engine}`);
}
