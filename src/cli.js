import { readFile, writeFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { analyzeText, sanitizeText } from './core/analyze.js';
import { applyProposal, buildProposal } from './core/diff.js';
import { autocompleteWithCodex, draftWithEngine, planWithEngine, rewriteWithEngine } from './engines/runner.js';
import { createMemoryStore } from './memory/index.js';
import { startGui } from './gui/server.js';
import { runCv } from './benchmark/run.js';
import { getEditModeInstruction, normalizeHonorificLevel } from './core/style.js';
import { searchVault } from './knowledge/vault.js';
import { getNiklStatus, syncNiklSources } from './knowledge/nikl-agent.js';
import { getExplanationProfile } from './core/context-graph.js';

const help = `KR-humanizer 0.10.1

사용법:
  kr-humanizer analyze <file|-> [--json]
  kr-humanizer sanitize <file|-> [--out <file>]
  kr-humanizer complete <file|-> [--tone <문체>] [--mode fluent|balanced|strict|concise] [--honorific 0-100] [--explanation minimal|balanced|maximal] [--graph <graph.json>] [--out <file>]
  kr-humanizer plan <prompt|-> [--engine codex|claude] [--explanation minimal|balanced|maximal] [--out <file>]
  kr-humanizer draft <prompt|-> --graph <graph.json> [--engine codex|claude] [--explanation minimal|balanced|maximal] [--out <file>]
  kr-humanizer rewrite <file|-> [--engine codex|claude] [--tone <문체>] [--mode fluent|balanced|strict|concise] [--honorific 0-100] [--explanation minimal|balanced|maximal] [--graph <graph.json>] [--out <file>]
  kr-humanizer knowledge <file|-> [--mode balanced] [--honorific 50] [--vault <Obsidian 폴더>] [--limit 8]
  kr-humanizer nikl status [--store <폴더>] [--vault <Obsidian 폴더>]
  kr-humanizer nikl sync [--store <폴더>] [--raw --acknowledge-license]
  kr-humanizer review <original> <rewritten> [--out <file>]
  kr-humanizer accept <proposal.json> --ids s1,s2 [--out <file>]
  kr-humanizer cv [--samples 3] [--folds 3] [--out-dir experiments/runs]
  kr-humanizer gui [--port 4317] [--no-open]

메모리 선택:
  --memory local (기본값)
  --memory mem0 --mem0-url http://127.0.0.1:8888 --user <id>
`;

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function positional(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) { if (!['--json', '--no-open', '--raw', '--acknowledge-license'].includes(args[index])) index += 1; }
    else values.push(args[index]);
  }
  return values;
}

async function readStdin() {
  let value = '';
  stdin.setEncoding('utf8');
  for await (const chunk of stdin) value += chunk;
  return value;
}

async function readInput(path) {
  if (!path || path === '-') return readStdin();
  return readFile(path, 'utf8');
}

async function emit(value, path) {
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (path) await writeFile(path, text, 'utf8');
  else stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

async function readGraph(path) {
  if (!path) return undefined;
  const value = JSON.parse(await readFile(path, 'utf8'));
  return value.flow ?? value;
}

export async function main(args) {
  const command = args[0];
  const rest = args.slice(1);
  const paths = positional(rest);
  if (!command || command === 'help' || rest.includes('--help')) return stdout.write(help);
  if (command === 'analyze') {
    const result = analyzeText(await readInput(paths[0]));
    return emit(result, option(rest, '--out'));
  }
  if (command === 'sanitize') {
    const result = sanitizeText(await readInput(paths[0]));
    return emit(rest.includes('--json') ? result : result.text, option(rest, '--out'));
  }
  if (command === 'complete') {
    const text = await readInput(paths[0]);
    const editMode = option(rest, '--mode', 'balanced');
    getEditModeInstruction(editMode);
    const honorificLevel = normalizeHonorificLevel(option(rest, '--honorific', '50'));
    const explanationLevel = option(rest, '--explanation', 'balanced');
    getExplanationProfile(explanationLevel);
    const contextGraph = await readGraph(option(rest, '--graph'));
    const result = await autocompleteWithCodex({ text, contextGraph, tone: option(rest, '--tone'), editMode, honorificLevel, explanationLevel });
    return emit(result.completion, option(rest, '--out'));
  }
  if (command === 'review') {
    const proposal = buildProposal(await readInput(paths[0]), await readInput(paths[1]));
    return emit(proposal, option(rest, '--out'));
  }
  if (command === 'accept') {
    const proposal = JSON.parse(await readFile(paths[0], 'utf8'));
    const ids = (option(rest, '--ids', '') ?? '').split(',').filter(Boolean);
    return emit(applyProposal(proposal, ids), option(rest, '--out'));
  }
  if (command === 'knowledge') {
    const text = await readInput(paths[0]);
    const editMode = option(rest, '--mode', 'balanced');
    getEditModeInstruction(editMode);
    const honorificLevel = normalizeHonorificLevel(option(rest, '--honorific', '50'));
    const matches = await searchVault({ text, editMode, honorificLevel, vaultPath: option(rest, '--vault'), limit: option(rest, '--limit', '8') });
    return emit(matches, option(rest, '--out'));
  }
  if (command === 'nikl') {
    const action = paths[0] ?? 'status';
    const storePath = option(rest, '--store');
    if (action === 'status') return emit(await getNiklStatus({ storePath, vaultPath: option(rest, '--vault') }), option(rest, '--out'));
    if (action === 'sync') {
      const outputPath = option(rest, '--out');
      const result = await syncNiklSources({ storePath, raw: rest.includes('--raw'), acknowledgeLicense: rest.includes('--acknowledge-license') });
      if (outputPath) return emit(result, outputPath);
      const licenseCounts = result.records.reduce((counts, record) => {
        const type = record.license?.type ?? 'unknown';
        counts[type] = (counts[type] ?? 0) + 1;
        return counts;
      }, {});
      return emit({ generatedAt: result.generatedAt, mode: result.mode, records: result.records.length, attachments: result.records.filter((record) => record.parentSourceId).length, totalBytes: result.totalBytes, licenseCounts, storePath: result.storePath });
    }
    throw new Error(`지원하지 않는 nikl 작업: ${action}`);
  }
  if (command === 'plan') {
    const brief = await readInput(paths[0]);
    const explanationLevel = option(rest, '--explanation', 'balanced');
    getExplanationProfile(explanationLevel);
    return emit(await planWithEngine({ engine: option(rest, '--engine', 'codex'), brief, tone: option(rest, '--tone'), explanationLevel }), option(rest, '--out'));
  }
  if (command === 'draft') {
    const brief = await readInput(paths[0]);
    const explanationLevel = option(rest, '--explanation', 'balanced');
    getExplanationProfile(explanationLevel);
    const contextGraph = await readGraph(option(rest, '--graph'));
    if (!contextGraph) throw new Error('draft 명령에는 --graph <graph.json>이 필요합니다.');
    const editMode = option(rest, '--mode', 'balanced');
    getEditModeInstruction(editMode);
    const honorificLevel = normalizeHonorificLevel(option(rest, '--honorific', '50'));
    const memory = createMemoryStore({ provider: option(rest, '--memory', 'local'), baseUrl: option(rest, '--mem0-url'), userId: option(rest, '--user', 'default') });
    const memories = (await memory.search(brief.slice(0, 500), 6)).map((item) => item.text);
    return emit(await draftWithEngine({ engine: option(rest, '--engine', 'codex'), brief, contextGraph, tone: option(rest, '--tone'), editMode, honorificLevel, explanationLevel, memories, vaultPath: option(rest, '--vault') }), option(rest, '--out'));
  }
  if (command === 'rewrite') {
    const text = await readInput(paths[0]);
    const editMode = option(rest, '--mode', 'balanced');
    getEditModeInstruction(editMode);
    const honorificLevel = normalizeHonorificLevel(option(rest, '--honorific', '50'));
    const explanationLevel = option(rest, '--explanation', 'balanced');
    getExplanationProfile(explanationLevel);
    const contextGraph = await readGraph(option(rest, '--graph'));
    const memory = createMemoryStore({ provider: option(rest, '--memory', 'local'), baseUrl: option(rest, '--mem0-url'), userId: option(rest, '--user', 'default') });
    const memories = (await memory.search(text.slice(0, 500), 6)).map((item) => item.text);
    const result = await rewriteWithEngine({ engine: option(rest, '--engine', 'codex'), text, contextGraph, tone: option(rest, '--tone'), editMode, honorificLevel, explanationLevel, memories, vaultPath: option(rest, '--vault') });
    const proposal = { ...buildProposal(text, result.rewrittenText), summary: result.summary, flow: { nodes: result.flow, edges: result.edges }, knowledge: result.knowledge, knowledgeAgent: result.knowledgeAgent };
    return emit(proposal, option(rest, '--out'));
  }
  if (command === 'cv') {
    const result = await runCv({
      samples: Number(option(rest, '--samples', '3')),
      folds: Number(option(rest, '--folds', '3')),
      outputRoot: option(rest, '--out-dir', 'experiments/runs'),
      onProgress: (message) => process.stderr.write(`[CV] ${message}\n`)
    });
    return emit(result);
  }
  if (command === 'gui') {
    const port = Number(option(rest, '--port', '4317'));
    await startGui({ port, open: !rest.includes('--no-open') });
    return;
  }
  throw new Error(`알 수 없는 명령: ${command}\n\n${help}`);
}
