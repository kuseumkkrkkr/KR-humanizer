import { readFileSync } from 'node:fs';

const MAX_TEXT = 200_000;
const rules = JSON.parse(readFileSync(new URL('../../data/ko-rules.json', import.meta.url), 'utf8'));
const invisiblePattern = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;

function assertText(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (text.length > MAX_TEXT) throw new RangeError(`text exceeds ${MAX_TEXT} characters`);
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitSentences(text) {
  assertText(text);
  const segmenter = new Intl.Segmenter('ko', { granularity: 'sentence' });
  return [...segmenter.segment(text)]
    .map(({ segment }) => segment.trim())
    .filter(Boolean);
}

export function detectInvisible(text) {
  assertText(text);
  const findings = [];
  for (const match of text.matchAll(invisiblePattern)) {
    const codePoint = match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    findings.push({
      kind: 'invisible',
      index: match.index,
      length: match[0].length,
      value: match[0],
      codePoint: `U+${codePoint}`,
      message: '비가시 Unicode 문자입니다. 언어상 필요한 문자일 수 있으므로 확인 후 정리하세요.'
    });
  }
  return findings;
}

function ruleFindings(text) {
  const findings = [];
  for (const rule of rules.filter((item) => !item.disabled)) {
    const expression = new RegExp(rule.regex ?? escaped(rule.pattern), 'gu');
    for (const match of text.matchAll(expression)) {
      findings.push({
        id: rule.id,
        kind: rule.kind,
        index: match.index,
        length: match[0].length,
        found: match[0],
        replacement: rule.replacement,
        message: rule.message,
        source: rule.source,
        confidence: rule.confidence
      });
    }
  }
  return findings;
}

export function buildFlow(text) {
  assertText(text);
  const paragraphs = text.split(/\r?\n\s*\r?\n/u).map((item) => item.trim()).filter(Boolean);
  const nodes = paragraphs.map((paragraph, index) => {
    const first = splitSentences(paragraph)[0] ?? paragraph;
    return { id: `p${index + 1}`, label: first.slice(0, 48), role: index === 0 ? '도입' : index === paragraphs.length - 1 ? '마무리' : '전개' };
  });
  return {
    nodes,
    edges: nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id, relation: '다음 문단' }))
  };
}

export function analyzeText(text) {
  assertText(text);
  const paragraphs = text.split(/\r?\n\s*\r?\n/u).map((item) => item.trim()).filter(Boolean);
  const sentences = splitSentences(text);
  const findings = [...ruleFindings(text), ...detectInvisible(text)];
  for (const sentence of sentences) {
    if (sentence.length > 80) {
      findings.push({ kind: 'long-sentence', found: sentence, length: sentence.length, message: '80자가 넘는 문장입니다. 의미 단위로 나눌 수 있는지 확인하세요.', confidence: 0.7 });
    }
  }
  return {
    stats: {
      characters: text.length,
      paragraphs: paragraphs.length,
      sentences: sentences.length,
      averageSentenceLength: sentences.length ? Number((sentences.reduce((sum, item) => sum + item.length, 0) / sentences.length).toFixed(1)) : 0
    },
    findings: findings.sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER)),
    flow: buildFlow(text)
  };
}

export function sanitizeText(text, { allowJoinControls = false } = {}) {
  assertText(text);
  const removed = [];
  const sanitized = text.replace(invisiblePattern, (value, index) => {
    const point = value.codePointAt(0);
    if (allowJoinControls && (point === 0x200c || point === 0x200d)) return value;
    removed.push({ index, codePoint: `U+${point.toString(16).toUpperCase().padStart(4, '0')}` });
    return '';
  }).normalize('NFC');
  return { text: sanitized, removed };
}
