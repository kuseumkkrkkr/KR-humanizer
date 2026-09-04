import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProposal } from '../core/diff.js';
import { rewriteWithEngine, runCodexStructured } from '../engines/runner.js';
import { groupedCrossValidation } from './classifier.js';
import { preservationAudit, textMetrics } from './metrics.js';
import { markdownReport, summarizeRun } from './report.js';

const topics = JSON.parse(await import('node:fs').then(({ readFileSync }) => readFileSync(new URL('../../data/cv-topics.json', import.meta.url), 'utf8')));
const baselineSchema = fileURLToPath(new URL('../../schemas/baseline.schema.json', import.meta.url));
const judgeSchema = fileURLToPath(new URL('../../schemas/cv-judge.schema.json', import.meta.url));

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

function blindFor(id) {
  return createHash('sha256').update(id).digest()[0] % 2 === 0
    ? { A: 'baseline', B: 'humanized' }
    : { A: 'humanized', B: 'baseline' };
}

export function validateBaseline(text, existingTexts = []) {
  const reasons = [];
  if (text.length < 400) reasons.push('too-short');
  if (/(?:어떤 글을 원하시나요|원하시면|알려\s*주세요|진행 대기|범위 확인|프롬프트)/u.test(text)) reasons.push('meta-response');
  if (/(?:https?:\/\/|사용 가능한 브라우저|스크린샷 검증|공식 자료를 바탕으로 작성)/u.test(text)) reasons.push('tool-artifact');
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (existingTexts.some((item) => item.replace(/\s+/gu, ' ').trim() === normalized)) reasons.push('duplicate');
  return { valid: reasons.length === 0, reasons };
}

export function validateRewrite(baseline, rewritten) {
  const reasons = [];
  const ratio = rewritten.length / Math.max(1, baseline.length);
  if (rewritten.length < 200 || ratio < 0.5 || ratio > 1.8) reasons.push('length-ratio');
  if (!preservationAudit(baseline, rewritten).numericTokensPreserved) reasons.push('numeric-mismatch');
  return { valid: reasons.length === 0, reasons, lengthRatio: Number(ratio.toFixed(3)) };
}

function jsonLines(items) {
  return `${items.map((item) => JSON.stringify(item)).join('\n')}\n`;
}

function judgePrompt(pairs) {
  const cases = pairs.map((pair) => {
    const A = pair.blind.A === 'baseline' ? pair.baseline : pair.humanized;
    const B = pair.blind.B === 'baseline' ? pair.baseline : pair.humanized;
    return `ID: ${pair.id}\n참조 원문:\n${pair.baseline}\n\n문안 A:\n${A}\n\n문안 B:\n${B}`;
  }).join('\n\n=====\n\n');
  return `한국어 편집 결과를 블라인드 평가하세요. A/B의 생성 방식을 추측하지 말고 텍스트만 보세요.
각 문안의 자연스러움, 가독성, 응집성을 1~5점으로 매기고 더 나은 문안을 고르세요.
참조 원문의 사실, 수치, 고유명사, 핵심 주장이 바뀌었으면 meaningChanged를 true로 표시하세요.
문체 선호만으로 의미 변경을 판정하지 마세요. 모든 ID를 정확히 한 번 평가하세요.

${cases}`;
}

export async function runCv({ samples = 3, folds = 3, outputRoot = 'experiments/runs', onProgress = () => {} } = {}) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new Error('samples는 1~10 정수여야 합니다.');
  if (!Number.isInteger(folds) || folds < 2 || folds > samples) throw new Error('folds는 2 이상 samples 이하 정수여야 합니다.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = resolve(outputRoot, stamp);
  const runPath = join(directory, 'run.json');
  const run = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    status: 'running',
    design: { samplesPerTopic: samples, folds, topics: topics.map(({ id, label, prompt }) => ({ id, label, prompt })), syntheticOnly: true, externalModelApi: false, isolatedCodex: true },
    pairs: []
  };
  await atomicJson(runPath, run);
  for (let sample = 0; sample < samples; sample += 1) {
    for (const topic of topics) {
      const id = `${topic.id}-${sample + 1}`;
      onProgress(`생성 ${run.pairs.length + 1}/${samples * topics.length}: ${topic.label}`);
      const baselineAttempts = [];
      let baseline;
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const candidate = await runCodexStructured({ prompt: topic.prompt, schemaPath: baselineSchema, timeoutMs: 180_000, isolated: true });
        const validation = validateBaseline(candidate.text, run.pairs.filter((pair) => pair.topic === topic.id).map((pair) => pair.baseline));
        baselineAttempts.push({ attempt, validation });
        if (validation.valid) { baseline = candidate; break; }
        onProgress(`${topic.label} 기준문 재생성: ${validation.reasons.join(', ')}`);
      }
      if (!baseline) throw new Error(`${topic.label} 기준문이 6회 검증을 통과하지 못했습니다.`);
      const rewriteAttempts = [];
      let rewritten;
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const candidate = await rewriteWithEngine({ engine: 'codex', text: baseline.text, tone: '편안하고 자연스러운 중립적 설명체', memories: [], timeoutMs: 180_000, isolated: true });
        const validation = validateRewrite(baseline.text, candidate.rewrittenText);
        rewriteAttempts.push({ attempt, validation });
        if (validation.valid) { rewritten = candidate; break; }
        onProgress(`${topic.label} 윤문 재생성: ${validation.reasons.join(', ')}`);
      }
      if (!rewritten) throw new Error(`${topic.label} 윤문이 6회 검증을 통과하지 못했습니다.`);
      run.pairs.push({
        id,
        topic: topic.id,
        topicLabel: topic.label,
        minimalPrompt: topic.prompt,
        baselineAttempts,
        rewriteAttempts,
        sample: sample + 1,
        fold: sample % folds,
        blind: blindFor(id),
        baseline: baseline.text,
        humanized: rewritten.rewrittenText,
        rewriteSummary: rewritten.summary,
        flow: { nodes: rewritten.flow, edges: rewritten.edges },
        proposal: buildProposal(baseline.text, rewritten.rewrittenText),
        preservation: preservationAudit(baseline.text, rewritten.rewrittenText),
        metrics: { baseline: textMetrics(baseline.text), humanized: textMetrics(rewritten.rewrittenText) }
      });
      await atomicJson(runPath, run);
    }
  }
  run.classifier = groupedCrossValidation(run.pairs, folds);
  for (let fold = 0; fold < folds; fold += 1) {
    const foldPairs = run.pairs.filter((pair) => pair.fold === fold);
    onProgress(`블라인드 평가 ${fold + 1}/${folds}`);
    const judged = await runCodexStructured({ prompt: judgePrompt(foldPairs), schemaPath: judgeSchema, timeoutMs: 180_000, isolated: true });
    const byId = new Map(judged.evaluations.map((item) => [item.id, item]));
    for (const pair of foldPairs) pair.judge = byId.get(pair.id) ?? null;
    await atomicJson(runPath, run);
  }
  run.status = 'complete';
  run.completedAt = new Date().toISOString();
  run.summary = summarizeRun(run);
  await atomicJson(runPath, run);
  const report = markdownReport(run);
  await writeFile(join(directory, 'report.md'), report, 'utf8');
  await writeFile(join(directory, 'baseline.jsonl'), jsonLines(run.pairs.map(({ id, topic, topicLabel, minimalPrompt, baseline }) => ({ id, topic, topicLabel, minimalPrompt, text: baseline }))), 'utf8');
  await writeFile(join(directory, 'humanized.jsonl'), jsonLines(run.pairs.map(({ id, topic, topicLabel, humanized }) => ({ id, topic, topicLabel, text: humanized }))), 'utf8');
  await writeFile(join(directory, 'opinions.jsonl'), jsonLines(run.pairs.map(({ id, topic, topicLabel, blind, judge }) => ({ id, topic, topicLabel, blind, judge }))), 'utf8');
  await writeFile(resolve('experiments/latest-report.md'), report, 'utf8');
  await atomicJson(resolve('experiments/latest-run.json'), run);
  onProgress('완료');
  return { directory, runPath, reportPath: join(directory, 'report.md'), summary: run.summary };
}
