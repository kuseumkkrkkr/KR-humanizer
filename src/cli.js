import { readFile, writeFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { analyzeText, sanitizeText } from './core/analyze.js';
import { applyProposal, buildProposal } from './core/diff.js';
import { rewriteWithEngine } from './engines/runner.js';
import { createMemoryStore } from './memory/index.js';
import { startGui } from './gui/server.js';
import { runCv } from './benchmark/run.js';

const help = `KR-humanizer 0.2.0

사용법:
  kr-humanizer analyze <file|-> [--json]
  kr-humanizer sanitize <file|-> [--out <file>]
  kr-humanizer rewrite <file|-> [--engine codex|claude] [--tone <문체>] [--out <file>]
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
    if (args[index].startsWith('--')) { if (!['--json', '--no-open'].includes(args[index])) index += 1; }
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
  if (command === 'review') {
    const proposal = buildProposal(await readInput(paths[0]), await readInput(paths[1]));
    return emit(proposal, option(rest, '--out'));
  }
  if (command === 'accept') {
    const proposal = JSON.parse(await readFile(paths[0], 'utf8'));
    const ids = (option(rest, '--ids', '') ?? '').split(',').filter(Boolean);
    return emit(applyProposal(proposal, ids), option(rest, '--out'));
  }
  if (command === 'rewrite') {
    const text = await readInput(paths[0]);
    const memory = createMemoryStore({ provider: option(rest, '--memory', 'local'), baseUrl: option(rest, '--mem0-url'), userId: option(rest, '--user', 'default') });
    const memories = (await memory.search(text.slice(0, 500), 6)).map((item) => item.text);
    const result = await rewriteWithEngine({ engine: option(rest, '--engine', 'codex'), text, tone: option(rest, '--tone'), memories });
    const proposal = { ...buildProposal(text, result.rewrittenText), summary: result.summary, flow: { nodes: result.flow, edges: result.edges } };
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
