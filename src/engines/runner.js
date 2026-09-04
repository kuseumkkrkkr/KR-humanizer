import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildRewritePrompt } from '../core/prompt.js';

const rewriteSchemaPath = fileURLToPath(new URL('../../schemas/rewrite.schema.json', import.meta.url));
const MAX_OUTPUT = 2 * 1024 * 1024;

function run(command, args, input, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let exceededStream = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_OUTPUT) { exceededStream = 'stdout'; child.kill(); }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr) > MAX_OUTPUT) { exceededStream = 'stderr'; child.kill(); }
    });
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`${command} 실행 실패: ${error.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (exceededStream) return reject(new Error(`${command} ${exceededStream} exceeded ${MAX_OUTPUT} bytes`));
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

export async function rewriteWithEngine({ engine = 'codex', text, tone, editMode = 'balanced', honorificLevel = 50, memories = [], timeoutMs, isolated = false }) {
  const prompt = buildRewritePrompt({ text, tone, editMode, honorificLevel, memories });
  if (engine === 'codex') {
    return assertResult(await runCodexStructured({ prompt, schemaPath: rewriteSchemaPath, timeoutMs, isolated }));
  }
  if (engine === 'claude') {
    const schema = await readFile(rewriteSchemaPath, 'utf8');
    const { stdout } = await run('claude', ['-p', '--output-format', 'json', '--json-schema', schema, '--permission-mode', 'plan', '--no-session-persistence'], prompt, timeoutMs);
    return parseClaude(stdout);
  }
  throw new Error(`지원하지 않는 엔진: ${engine}`);
}

export async function runCodexStructured({ prompt, schemaPath, timeoutMs, isolated = false }) {
  const outputPath = join(tmpdir(), `kr-humanizer-${randomUUID()}.json`);
  try {
    const isolationArgs = isolated ? ['--ignore-user-config', '--ignore-rules'] : [];
    await run('codex', ['exec', ...isolationArgs, '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--output-schema', schemaPath, '--output-last-message', outputPath, '-'], prompt, timeoutMs);
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}
