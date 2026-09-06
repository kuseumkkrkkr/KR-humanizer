import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildAutocompletePrompt, buildDraftPrompt, buildPlanPrompt, buildRewritePrompt } from '../core/prompt.js';
import { activeContextGraph, normalizeContextGraph } from '../core/context-graph.js';
import { searchVault } from '../knowledge/vault.js';
import { buildKnowledgeAgentReport } from '../knowledge/nikl-agent.js';
import { normalizeEditMode } from '../core/style.js';

const rewriteSchemaPath = fileURLToPath(new URL('../../schemas/rewrite.schema.json', import.meta.url));
const planSchemaPath = fileURLToPath(new URL('../../schemas/plan.schema.json', import.meta.url));
const autocompleteSchemaPath = fileURLToPath(new URL('../../schemas/autocomplete.schema.json', import.meta.url));
const MAX_OUTPUT = 2 * 1024 * 1024;
export const AUTOCOMPLETE_MODEL = 'gpt-5.3-codex-spark';
export const AUTOCOMPLETE_MODELS = Object.freeze([
  { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { id: 'codex-mini-latest', label: 'Codex Mini' }
]);

export function normalizeAutocompleteModel(value = AUTOCOMPLETE_MODEL) {
  const model = String(value || AUTOCOMPLETE_MODEL);
  if (!AUTOCOMPLETE_MODELS.some((item) => item.id === model)) throw Object.assign(new Error(`지원하지 않는 자동완성 모델: ${model}`), { status: 400 });
  return model;
}

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

export function knowledgeForEditMode(matches, editMode) {
  const mode = normalizeEditMode(editMode);
  if (mode === 'strict') return matches;
  if (mode === 'medium') return matches.filter((item) => ['writing-guidance', 'skill-observation'].includes(item.kind));
  return matches.filter((item) => item.id === 'nikl-writing-ending-genre-consistency');
}

function assertPlan(value) {
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error('엔진이 예상한 계획 JSON을 반환하지 않았습니다.');
  const graph = normalizeContextGraph(value);
  if (!graph.nodes.length) throw new Error('계획에 사용할 노드가 없습니다.');
  return { summary: String(value.summary ?? ''), ...graph };
}

export function assertCompletion(value) {
  if (!value || typeof value.completion !== 'string') throw new Error('자동완성 엔진이 예상한 JSON을 반환하지 않았습니다.');
  const clean = value.completion.trim().replace(/^[“”"']+|[“”"']+$/g, '').slice(0, 300);
  const firstSentence = clean.match(/^.*?[.!?。！？](?:["'”’)]*)?(?=\s|$)/s)?.[0] ?? clean;
  return { completion: firstSentence.trim() };
}

function parseClaude(stdout, validate) {
  const outer = JSON.parse(stdout);
  if (outer.structured_output) return validate(outer.structured_output);
  if (typeof outer.result === 'string') return validate(JSON.parse(outer.result));
  return validate(outer);
}

async function structuredWithEngine({ engine, prompt, schemaPath, validate, timeoutMs, isolated, model }) {
  if (engine === 'codex') return validate(await runCodexStructured({ prompt, schemaPath, timeoutMs, isolated, model: model ? normalizeAutocompleteModel(model) : undefined }));
  if (engine === 'claude') {
    const schema = await readFile(schemaPath, 'utf8');
    const { stdout } = await run('claude', ['-p', '--output-format', 'json', '--json-schema', schema, '--permission-mode', 'plan', '--no-session-persistence'], prompt, timeoutMs);
    return parseClaude(stdout, validate);
  }
  throw new Error(`지원하지 않는 엔진: ${engine}`);
}

export async function planWithEngine({ engine = 'codex', brief, tone, explanationLevel = 'balanced', model, timeoutMs, isolated = false }) {
  if (!String(brief ?? '').trim()) throw new Error('Plan 모드에는 글쓰기 프롬프트가 필요합니다.');
  return structuredWithEngine({ engine, prompt: buildPlanPrompt({ brief, tone, explanationLevel }), schemaPath: planSchemaPath, validate: assertPlan, timeoutMs, isolated, model });
}

export async function draftWithEngine({ engine = 'codex', brief, contextGraph, tone, editMode = 'medium', honorificLevel = 50, explanationLevel = 'balanced', memories = [], vaultPath, model, timeoutMs, isolated = false }) {
  if (!String(brief ?? '').trim()) throw new Error('초안 작성에는 글쓰기 프롬프트가 필요합니다.');
  const graph = activeContextGraph(contextGraph);
  if (!graph.nodes.length) throw new Error('초안에 포함할 맥락 노드가 필요합니다.');
  const mode = normalizeEditMode(editMode);
  const knowledge = knowledgeForEditMode(await searchVault({ text: brief, editMode: mode, honorificLevel, vaultPath }), mode);
  const prompt = buildDraftPrompt({ brief, contextGraph: graph, tone, editMode: mode, honorificLevel, explanationLevel, memories, knowledge });
  const result = await structuredWithEngine({ engine, prompt, schemaPath: rewriteSchemaPath, validate: assertResult, timeoutMs, isolated, model });
  return { ...result, knowledge, knowledgeAgent: buildKnowledgeAgentReport(knowledge) };
}

export async function rewriteWithEngine({ engine = 'codex', text, brief = '', contextGraph, tone, editMode = 'medium', honorificLevel = 50, explanationLevel = 'balanced', memories = [], vaultPath, model, timeoutMs, isolated = false }) {
  const mode = normalizeEditMode(editMode);
  const knowledge = knowledgeForEditMode(await searchVault({ text, editMode: mode, honorificLevel, vaultPath }), mode);
  const prompt = buildRewritePrompt({ text, brief, contextGraph: activeContextGraph(contextGraph), tone, editMode: mode, honorificLevel, explanationLevel, memories, knowledge });
  const result = await structuredWithEngine({ engine, prompt, schemaPath: rewriteSchemaPath, validate: assertResult, timeoutMs, isolated, model });
  return { ...result, knowledge, knowledgeAgent: buildKnowledgeAgentReport(knowledge) };
}

export async function autocompleteWithCodex({ text, contextGraph, tone, editMode = 'medium', honorificLevel = 50, explanationLevel = 'balanced', model = AUTOCOMPLETE_MODEL, timeoutMs = 60_000 }) {
  const value = String(text ?? '').trim();
  if (value.length < 20) throw Object.assign(new Error('자동완성에는 20자 이상의 문맥이 필요합니다.'), { status: 400 });
  if (value.length > 200_000) throw Object.assign(new Error('자동완성 문맥은 200,000자를 넘을 수 없습니다.'), { status: 400 });
  const prompt = buildAutocompletePrompt({ text: value, contextGraph: activeContextGraph(contextGraph), tone, editMode, honorificLevel, explanationLevel });
  return assertCompletion(await runCodexStructured({ prompt, schemaPath: autocompleteSchemaPath, timeoutMs, model: normalizeAutocompleteModel(model), isolated: true }));
}

export async function checkCodexAvailable(timeoutMs = 5_000) {
  try {
    const { stdout } = await run('codex', ['--version'], '', timeoutMs);
    return { available: true, version: stdout.trim(), model: AUTOCOMPLETE_MODEL, models: AUTOCOMPLETE_MODELS };
  } catch {
    return { available: false, version: '', model: AUTOCOMPLETE_MODEL, models: AUTOCOMPLETE_MODELS };
  }
}

export async function runCodexStructured({ prompt, schemaPath, timeoutMs, isolated = false, model }) {
  const outputPath = join(tmpdir(), `kr-humanizer-${randomUUID()}.json`);
  try {
    const isolationArgs = isolated ? ['--ignore-user-config', '--ignore-rules'] : [];
    const modelArgs = model ? ['--model', model] : [];
    await run('codex', ['exec', ...isolationArgs, ...modelArgs, '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--output-schema', schemaPath, '--output-last-message', outputPath, '-'], prompt, timeoutMs);
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}
