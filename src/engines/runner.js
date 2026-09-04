import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildDraftPrompt, buildPlanPrompt, buildRewritePrompt } from '../core/prompt.js';
import { activeContextGraph, normalizeContextGraph } from '../core/context-graph.js';
import { searchVault } from '../knowledge/vault.js';

const rewriteSchemaPath = fileURLToPath(new URL('../../schemas/rewrite.schema.json', import.meta.url));
const planSchemaPath = fileURLToPath(new URL('../../schemas/plan.schema.json', import.meta.url));
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

function assertPlan(value) {
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error('엔진이 예상한 계획 JSON을 반환하지 않았습니다.');
  const graph = normalizeContextGraph(value);
  if (!graph.nodes.length) throw new Error('계획에 사용할 노드가 없습니다.');
  return { summary: String(value.summary ?? ''), ...graph };
}

function parseClaude(stdout, validate) {
  const outer = JSON.parse(stdout);
  if (outer.structured_output) return validate(outer.structured_output);
  if (typeof outer.result === 'string') return validate(JSON.parse(outer.result));
  return validate(outer);
}

async function structuredWithEngine({ engine, prompt, schemaPath, validate, timeoutMs, isolated }) {
  if (engine === 'codex') return validate(await runCodexStructured({ prompt, schemaPath, timeoutMs, isolated }));
  if (engine === 'claude') {
    const schema = await readFile(schemaPath, 'utf8');
    const { stdout } = await run('claude', ['-p', '--output-format', 'json', '--json-schema', schema, '--permission-mode', 'plan', '--no-session-persistence'], prompt, timeoutMs);
    return parseClaude(stdout, validate);
  }
  throw new Error(`지원하지 않는 엔진: ${engine}`);
}

export async function planWithEngine({ engine = 'codex', brief, tone, explanationLevel = 'balanced', timeoutMs, isolated = false }) {
  if (!String(brief ?? '').trim()) throw new Error('Plan 모드에는 글쓰기 프롬프트가 필요합니다.');
  return structuredWithEngine({ engine, prompt: buildPlanPrompt({ brief, tone, explanationLevel }), schemaPath: planSchemaPath, validate: assertPlan, timeoutMs, isolated });
}

export async function draftWithEngine({ engine = 'codex', brief, contextGraph, tone, editMode = 'balanced', honorificLevel = 50, explanationLevel = 'balanced', memories = [], vaultPath, timeoutMs, isolated = false }) {
  if (!String(brief ?? '').trim()) throw new Error('초안 작성에는 글쓰기 프롬프트가 필요합니다.');
  const graph = activeContextGraph(contextGraph);
  if (!graph.nodes.length) throw new Error('초안에 포함할 맥락 노드가 필요합니다.');
  const knowledge = await searchVault({ text: brief, editMode, honorificLevel, vaultPath });
  const prompt = buildDraftPrompt({ brief, contextGraph: graph, tone, editMode, honorificLevel, explanationLevel, memories, knowledge });
  const result = await structuredWithEngine({ engine, prompt, schemaPath: rewriteSchemaPath, validate: assertResult, timeoutMs, isolated });
  return { ...result, knowledge };
}

export async function rewriteWithEngine({ engine = 'codex', text, brief = '', contextGraph, tone, editMode = 'balanced', honorificLevel = 50, explanationLevel = 'balanced', memories = [], vaultPath, timeoutMs, isolated = false }) {
  const knowledge = await searchVault({ text, editMode, honorificLevel, vaultPath });
  const prompt = buildRewritePrompt({ text, brief, contextGraph: activeContextGraph(contextGraph), tone, editMode, honorificLevel, explanationLevel, memories, knowledge });
  const result = await structuredWithEngine({ engine, prompt, schemaPath: rewriteSchemaPath, validate: assertResult, timeoutMs, isolated });
  return { ...result, knowledge };
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
